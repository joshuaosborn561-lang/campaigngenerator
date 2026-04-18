import { supabase } from "@/lib/supabase";

export type ClaudeGroundingOptions = {
  /** When set, pack emphasizes this client's campaigns + verified meetings for their contacts. */
  clientId: string | null;
  /** Optional vertical from the brief — narrows warehouse examples to similar clients. */
  industryVertical?: string | null;
};

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(2)}%`;
}

function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

async function clientIdsForIndustry(industry: string): Promise<string[]> {
  const { data } = await supabase
    .from("clients")
    .select("id")
    .ilike("industry_vertical", `%${industry.trim()}%`)
    .limit(40);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * Compact, factual summary for Claude — prefer this block over generic priors.
 */
export async function buildHistoricalDataPack(opts: ClaudeGroundingOptions): Promise<string> {
  const lines: string[] = [];
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceIso = since.toISOString();

  const scopes = ["agency", "client", "mixed", "unknown"] as const;
  const scopeCounts: string[] = [];
  let totalActive = 0;
  let ceErr: Error | null = null;

  for (const scope of scopes) {
    const { count, error } = await supabase
      .from("calendly_events")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("meeting_scope", scope)
      .gte("event_start_at", sinceIso);
    if (error) ceErr = new Error(error.message);
    const n = count ?? 0;
    totalActive += n;
    scopeCounts.push(`${scope}=${n}`);
  }

  if (ceErr) {
    lines.push(`CALENDLY-VERIFIED (90d): query error — ${ceErr.message}`);
  } else {
    lines.push(
      `CALENDLY-VERIFIED MEETINGS (last 90d, all scopes): ${totalActive} active. Breakdown by meeting_scope → ${scopeCounts.join(
        ", "
      )}. (Use CALENDLY_ACCOUNT_MAP to bind each Calendly organization/user URI to agency vs a client_id; CALENDLY_AGENCY_* for internal invitees; otherwise contact→campaigns inference.)`
    );
  }

  if (opts.clientId) {
    const { count: attributed, error: c2e } = await supabase
      .from("calendly_events")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("meeting_scope", "client")
      .eq("inferred_client_id", opts.clientId)
      .gte("event_start_at", sinceIso);

    if (c2e) {
      lines.push(`CALENDLY for this client (inferred_client_id): query error — ${c2e.message}`);
    } else {
      lines.push(
        `CALENDLY-VERIFIED for THIS CLIENT (90d, meeting_scope=client & inferred_client_id match): ${attributed ?? 0}`
      );
    }
  }

  lines.push("");
  lines.push("TOP CAMPAIGNS BY REPLY RATE (min 150 sends — warehouse priors):");

  let campQuery = supabase
    .from("campaigns")
    .select(
      "name, offer_type, send_volume, open_rate, reply_rate, bounce_rate, meetings_booked, positive_reply_count, clients ( name, industry_vertical )"
    )
    .gte("send_volume", 150)
    .not("reply_rate", "is", null)
    .order("reply_rate", { ascending: false, nullsFirst: false })
    .limit(12);

  if (opts.clientId) {
    campQuery = campQuery.eq("client_id", opts.clientId);
  } else if (opts.industryVertical?.trim()) {
    const ids = await clientIdsForIndustry(opts.industryVertical);
    if (ids.length) campQuery = campQuery.in("client_id", ids);
  }

  const { data: topCampaigns, error: cErr } = await campQuery;
  if (cErr) {
    lines.push(`  (campaign query error: ${cErr.message})`);
  } else if (!topCampaigns?.length) {
    lines.push("  (no qualifying campaigns yet — run sync / historical load.)");
  } else {
    for (const c of topCampaigns as Record<string, unknown>[]) {
      const cl = c.clients as { name?: string; industry_vertical?: string | null } | null;
      lines.push(
        `  - "${String(c.name)}" (${cl?.name ?? "?"}${
          cl?.industry_vertical ? ` · ${cl.industry_vertical}` : ""
        }) sends=${num(c.send_volume as number)} open=${pct(c.open_rate as number)} reply=${pct(
          c.reply_rate as number
        )} bounce=${pct(c.bounce_rate as number)} offer_type=${c.offer_type ?? "—"} meetings_booked=${num(
          c.meetings_booked as number
        )} positive_replies=${num(c.positive_reply_count as number)}`
      );
    }
  }

  lines.push("");
  lines.push("OFFER_TYPE SNAPSHOT (min 80 sends, same scope):");

  let offerQuery = supabase
    .from("campaigns")
    .select("offer_type, send_volume, reply_rate, meetings_booked")
    .not("offer_type", "is", null)
    .gte("send_volume", 80);

  if (opts.clientId) {
    offerQuery = offerQuery.eq("client_id", opts.clientId);
  } else if (opts.industryVertical?.trim()) {
    const ids = await clientIdsForIndustry(opts.industryVertical);
    if (ids.length) offerQuery = offerQuery.in("client_id", ids);
  }

  const { data: offerRows, error: oErr } = await offerQuery;
  if (!oErr && offerRows?.length) {
    const agg = new Map<string, { sends: number; weightedReply: number; meetings: number }>();
    for (const r of offerRows as {
      offer_type: string;
      send_volume: number | null;
      reply_rate: number | null;
      meetings_booked: number | null;
    }[]) {
      const k = r.offer_type || "unknown";
      const sends = Number(r.send_volume) || 0;
      const reply = Number(r.reply_rate) || 0;
      const mtg = Number(r.meetings_booked) || 0;
      const cur = agg.get(k) ?? { sends: 0, weightedReply: 0, meetings: 0 };
      cur.sends += sends;
      cur.weightedReply += reply * sends;
      cur.meetings += mtg;
      agg.set(k, cur);
    }
    const ranked = [...agg.entries()]
      .map(([offer_type, v]) => ({
        offer_type,
        avgReply: v.sends ? v.weightedReply / v.sends : 0,
        sends: v.sends,
        meetings: v.meetings,
      }))
      .sort((a, b) => b.avgReply - a.avgReply)
      .slice(0, 8);
    for (const r of ranked) {
      lines.push(
        `  - ${r.offer_type}: avg_reply≈${pct(r.avgReply)} over ~${num(r.sends)} sends, meetings_booked=${num(r.meetings)}`
      );
    }
  } else {
    lines.push("  (insufficient classified campaigns.)");
  }

  lines.push("");
  lines.push("SUBJECT LINES (step 1, by reply rate — up to 8 rows):");

  let subjQuery = supabase
    .from("subject_line_performance")
    .select("subject_line, reply_rate, open_rate, campaign_name, client_name, industry_vertical")
    .not("reply_rate", "is", null)
    .order("reply_rate", { ascending: false, nullsFirst: false })
    .limit(8);

  if (opts.clientId) {
    const { data: cn } = await supabase.from("clients").select("name").eq("id", opts.clientId).maybeSingle();
    if (cn?.name) subjQuery = subjQuery.eq("client_name", cn.name);
  } else if (opts.industryVertical?.trim()) {
    subjQuery = subjQuery.ilike("industry_vertical", `%${opts.industryVertical.trim()}%`);
  }

  const { data: subs, error: sErr } = await subjQuery;
  if (!sErr && subs?.length) {
    for (const s of subs as Record<string, unknown>[]) {
      lines.push(
        `  - "${String(s.subject_line ?? "").slice(0, 120)}" reply=${pct(s.reply_rate as number)} open=${pct(
          s.open_rate as number
        )} (${s.client_name ?? "?"})`
      );
    }
  } else {
    lines.push("  (no subject_line rows for this filter.)");
  }

  const text = lines.join("\n");
  const max = 11000;
  if (text.length > max) return text.slice(0, max) + "\n…(truncated)";
  return text;
}
