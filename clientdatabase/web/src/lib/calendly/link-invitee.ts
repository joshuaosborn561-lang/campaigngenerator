import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCalendlyAccountMap } from "./account-map";
import { isAgencyInviteeEmail } from "./agency-scope";

type MeetingScope = "agency" | "client" | "mixed" | "unknown";

export type CalendlyWebhookContext = {
  organizationUri: string | null;
  userUri: string | null;
};

async function inferClientFromContact(
  supabase: SupabaseClient,
  contactId: string
): Promise<{ scope: MeetingScope; clientId: string | null; rule: string }> {
  const { data: ccRows } = await supabase
    .from("contact_campaigns")
    .select("campaign_id")
    .eq("contact_id", contactId)
    .limit(2000);

  const campaignIds = [...new Set((ccRows ?? []).map((r) => r.campaign_id as string))];
  if (!campaignIds.length) {
    return { scope: "unknown", clientId: null, rule: "contact_no_campaign_links" };
  }

  const slice = campaignIds.slice(0, 500);
  const { data: camps } = await supabase
    .from("campaigns")
    .select("client_id, send_volume")
    .in("id", slice);

  const byClient = new Map<string, number>();
  for (const c of camps ?? []) {
    const cid = c.client_id as string | null;
    if (!cid) continue;
    const w = Number(c.send_volume) || 0;
    byClient.set(cid, (byClient.get(cid) ?? 0) + Math.max(w, 1));
  }

  if (byClient.size === 0) {
    return { scope: "unknown", clientId: null, rule: "contact_no_client_campaigns" };
  }
  if (byClient.size === 1) {
    return {
      scope: "client",
      clientId: [...byClient.keys()][0],
      rule: "single_client_from_contact_campaigns",
    };
  }

  const ranked = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  const topW = ranked[0][1];
  const secondW = ranked[1]?.[1] ?? 0;
  if (topW > 0 && secondW / topW < 0.35) {
    return {
      scope: "client",
      clientId: ranked[0][0],
      rule: "dominant_client_from_contact_campaigns",
    };
  }

  return { scope: "mixed", clientId: null, rule: "contact_multi_client_ambiguous" };
}

/**
 * Link invitee → contact/lead, then attribute meeting_scope using (in order):
 * 1) CALENDLY_ACCOUNT_MAP — which Calendly org/user is yours vs a client's account
 * 2) CALENDLY_AGENCY_* invitee email rules (your team on a shared calendar)
 * 3) Warehouse contact → campaigns inference
 */
export async function enrichCalendlyEvent(
  supabase: SupabaseClient,
  calendlyEventId: string,
  email: string,
  webhook: CalendlyWebhookContext
): Promise<void> {
  const norm = email.trim().toLowerCase();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .ilike("email", norm)
    .maybeSingle();

  let leadId: string | null = null;
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .ilike("email", norm)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead) leadId = lead.id;

  let meeting_scope: MeetingScope = "unknown";
  let inferred_client_id: string | null = null;
  let attribution_rule: string | null = null;

  const mapped = resolveCalendlyAccountMap(webhook.organizationUri, webhook.userUri);

  if (mapped.entry?.type === "agency") {
    meeting_scope = "agency";
    inferred_client_id = null;
    attribution_rule = `calendly_account_map_agency:${mapped.matchedKey ?? "?"}`;
  } else if (mapped.entry?.type === "client") {
    meeting_scope = "client";
    inferred_client_id = mapped.entry.client_id;
    attribution_rule = `calendly_account_map_client_calendar:${mapped.matchedKey ?? "?"}`;
  } else if (isAgencyInviteeEmail(norm)) {
    meeting_scope = "agency";
    attribution_rule = "agency_email_or_domain_env";
    inferred_client_id = null;
  } else if (contact?.id) {
    const inf = await inferClientFromContact(supabase, contact.id as string);
    meeting_scope = inf.scope;
    inferred_client_id = inf.clientId;
    attribution_rule = inf.rule;
  } else {
    meeting_scope = "unknown";
    attribution_rule = "no_contact_match";
    inferred_client_id = null;
  }

  await supabase
    .from("calendly_events")
    .update({
      contact_id: contact?.id ?? null,
      lead_id: leadId,
      meeting_scope,
      inferred_client_id,
      attribution_rule,
      source_organization_uri: webhook.organizationUri,
      source_user_uri: webhook.userUri,
      updated_at: new Date().toISOString(),
    })
    .eq("id", calendlyEventId);
}
