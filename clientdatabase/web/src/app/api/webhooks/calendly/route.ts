import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyCalendlyWebhookSignature } from "@/lib/calendly/verify-signature";
import { extractInviteeFromWebhook } from "@/lib/calendly/parse-payload";
import { enrichCalendlyEvent } from "@/lib/calendly/link-invitee";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/calendly
 *
 * Configure in Calendly: Webhook URL = https://<your-domain>/api/webhooks/calendly
 * Signing key → CALENDLY_WEBHOOK_SIGNING_KEY (same value Calendly shows when creating the subscription).
 *
 * For local testing only: CALENDLY_SKIP_SIGNATURE_VERIFY=true (never enable in production).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? "";
  const skipVerify = process.env.CALENDLY_SKIP_SIGNATURE_VERIFY === "true";
  const sigHeader = req.headers.get("calendly-webhook-signature");

  if (!skipVerify) {
    const signingKeys = [
      ...(process.env.CALENDLY_WEBHOOK_SIGNING_KEYS ?? "")
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      signingKey.trim(),
    ].filter((k, i, a) => k && a.indexOf(k) === i);

    if (!signingKeys.length) {
      return NextResponse.json(
        {
          error:
            "Configure CALENDLY_WEBHOOK_SIGNING_KEY or CALENDLY_WEBHOOK_SIGNING_KEYS (comma-separated when you have multiple Calendly subscriptions).",
        },
        { status: 503 }
      );
    }
    const valid = signingKeys.some((k) => verifyCalendlyWebhookSignature(rawBody, sigHeader, k));
    if (!valid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = extractInviteeFromWebhook(body);
  if (!parsed) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No Calendly invitee payload in event" });
  }

  const row = {
    invitee_uri: parsed.inviteeUri,
    event_uri: parsed.eventUri,
    invitee_email: parsed.inviteeEmail,
    invitee_name: parsed.inviteeName,
    event_name: parsed.eventName,
    status: parsed.status,
    event_start_at: parsed.eventStartAt,
    event_end_at: parsed.eventEndAt,
    canceled_at: parsed.canceledAt,
    calendly_event_type: parsed.eventType,
    source_organization_uri: parsed.organizationUri,
    source_user_uri: parsed.userUri,
    raw_payload: body as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("calendly_events")
    .select("id")
    .eq("invitee_uri", parsed.inviteeUri)
    .maybeSingle();

  let rowId: string;

  if (existing?.id) {
    const { error: upErr } = await supabase.from("calendly_events").update(row).eq("id", existing.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    rowId = existing.id;
  } else {
    const { data: ins, error: inErr } = await supabase
      .from("calendly_events")
      .insert(row)
      .select("id")
      .single();
    if (inErr) {
      return NextResponse.json({ error: inErr.message }, { status: 500 });
    }
    rowId = ins.id;
  }

  await enrichCalendlyEvent(supabase, rowId, parsed.inviteeEmail, {
    organizationUri: parsed.organizationUri,
    userUri: parsed.userUri,
  });

  return NextResponse.json({ ok: true, id: rowId });
}
