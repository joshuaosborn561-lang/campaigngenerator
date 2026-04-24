import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type CampaignRow = {
  id: string;
  source_platform: string | null;
  name: string | null;
  reply_rate: number | null;
  send_volume: number | null;
  positive_reply_count: number | null;
  offer_type: string | null;
};

type LeadRow = { has_replied?: boolean | null; meeting_booked?: boolean | null; campaign_id: string };

type BriefRow = { strategy_offer_id: string | null; name: string; status: string; created_at: string };

type OfferRef = { id: string; name: string; one_liner: string | null };

/**
 * GET /api/campaign-tester/client-insights?client_id=...
 * Aggregated SmartLead + HeyReach campaign stats and brief/offer context for "what worked" UI.
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id")?.trim() ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  const { data: campaigns, error: cErr } = await supabase
    .from("campaigns")
    .select(
      "id, name, source_platform, reply_rate, send_volume, positive_reply_count, offer_type"
    )
    .eq("client_id", clientId);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const cm = (campaigns ?? []) as CampaignRow[];
  const campaignIds = cm.map((c) => c.id);
  if (campaignIds.length === 0) {
    const { data: br } = await supabase
      .from("campaign_briefs")
      .select("id, name, status, strategy_offer_id, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const { data: strategies } = await supabase
      .from("client_strategies")
      .select("id")
      .eq("client_id", clientId);
    const sids = (strategies ?? []).map((s: { id: string }) => s.id);
    let offers: OfferRef[] = [];
    if (sids.length) {
      const { data: o } = await supabase
        .from("strategy_offers")
        .select("id, name, one_liner")
        .in("strategy_id", sids);
      offers = (o ?? []) as OfferRef[];
    }
    return NextResponse.json({
      clientId,
      syncNote:
        "No outreach campaigns in the warehouse yet. When sync runs, SmartLead and HeyReach will roll up by platform; see Railway SMARTLEAD_ACCOUNT_API_KEY and optional SMARTLEAD_CLIENT_ID (agency sub-accounts).",
      platforms: {
        smartlead: { campaigns: 0, leadRows: 0, replied: 0, meetings: 0, avgReplyRate: null as number | null },
        heyreach: { campaigns: 0, leadRows: 0, replied: 0, meetings: 0, avgReplyRate: null as number | null },
        total: { leadRows: 0, replied: 0, meetings: 0 },
      },
      topCampaigns: [] as { name: string | null; source_platform: string | null; reply_rate: number | null; positive_replies: number | null; sends: number | null }[],
      offers: offers.map((o) => ({
        id: o.id,
        name: o.name,
        one_liner: o.one_liner,
        briefs_spawned: 0,
        last_brief_at: null as string | null,
        reply_success_hint: null as string | null,
      })),
      briefs: (br ?? []) as BriefRow[],
    });
  }

  const { data: leads, error: lErr } = await supabase
    .from("leads")
    .select("campaign_id, has_replied, meeting_booked")
    .in("campaign_id", campaignIds);
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }
  const L = (leads ?? []) as LeadRow[];

  function agg(pl: "smartlead" | "heyreach" | "all") {
    const cset =
      pl === "all"
        ? new Set(cm.map((c) => c.id))
        : new Set(cm.filter((c) => c.source_platform === pl).map((c) => c.id));
    const subset = L.filter((l) => cset.has(l.campaign_id));
    const replied = subset.filter((l) => l.has_replied === true).length;
    const meetings = subset.filter((l) => l.meeting_booked === true).length;
    const relevant = pl === "all" ? cm : cm.filter((c) => c.source_platform === pl);
    let wSum = 0;
    let wVol = 0;
    for (const c of relevant) {
      const v = c.send_volume ?? 0;
      if (v > 0 && c.reply_rate != null) {
        wSum += c.reply_rate * v;
        wVol += v;
      }
    }
    return {
      campaigns: relevant.length,
      leadRows: subset.length,
      replied,
      meetings,
      avgReplyRate: wVol > 0 ? wSum / wVol : null,
    };
  }

  const { data: br } = await supabase
    .from("campaign_briefs")
    .select("id, name, status, strategy_offer_id, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const { data: strategies } = await supabase.from("client_strategies").select("id").eq("client_id", clientId);
  const sids = (strategies ?? []).map((s: { id: string }) => s.id);
  const { data: allOffers } =
    sids.length > 0
      ? await supabase.from("strategy_offers").select("id, name, one_liner").in("strategy_id", sids)
      : { data: [] as OfferRef[] };

  const briefs = (br ?? []) as BriefRow[];
  const byOffer = new Map<string, { briefCount: number; lastAt: string | null }>();
  for (const b of briefs) {
    if (!b.strategy_offer_id) continue;
    const cur = byOffer.get(b.strategy_offer_id) ?? { briefCount: 0, lastAt: null };
    cur.briefCount += 1;
    if (!cur.lastAt || b.created_at > cur.lastAt) cur.lastAt = b.created_at;
    byOffer.set(b.strategy_offer_id, cur);
  }

  const offers = ((allOffers ?? []) as OfferRef[]).map((o) => {
    const b = byOffer.get(o.id);
    return {
      id: o.id,
      name: o.name,
      one_liner: o.one_liner,
      briefs_spawned: b?.briefCount ?? 0,
      last_brief_at: b?.lastAt ?? null,
      /** Future: link brief → live campaign to attribute replies to offer */
      reply_success_hint: (b?.briefCount ?? 0) > 0 ? `${b?.briefCount} brief(s) used this offer; compare to campaign reply % below` : "No prior briefs with this offer",
    };
  });

  const slA = agg("smartlead");
  const hrA = agg("heyreach");
  const topCampaigns = [...cm]
    .sort(
      (a, b) =>
        (b.positive_reply_count ?? 0) - (a.positive_reply_count ?? 0) || (b.reply_rate ?? 0) - (a.reply_rate ?? 0)
    )
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      source_platform: c.source_platform,
      reply_rate: c.reply_rate,
      positive_replies: c.positive_reply_count,
      sends: c.send_volume,
    }));

  return NextResponse.json({
    clientId,
    syncNote:
      slA.campaigns === 0 && hrA.campaigns > 0
        ? "SmartLead shows 0 campaigns in the warehouse. Confirm SMARTLEAD_ACCOUNT_API_KEY in Railway; if you use a SmartLead sub-client, set SMARTLEAD_CLIENT_ID. Fixed API parse for { campaigns: [] } response in sync."
        : null,
    platforms: {
      smartlead: slA,
      heyreach: hrA,
      total: {
        leadRows: L.length,
        replied: L.filter((l) => l.has_replied === true).length,
        meetings: L.filter((l) => l.meeting_booked === true).length,
      },
    },
    topCampaigns,
    offers,
    briefs: briefs.slice(0, 20),
  });
}
