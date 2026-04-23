import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/campaign-tester/briefs/spawn
 *
 * Body:
 * {
 *   client_id: string,
 *   strategy_id: string,
 *   lane_id: string,
 *   offer_id: string,
 *   campaign_name: string,
 *   idea_id?: string
 * }
 *
 * Creates a campaign_briefs row linked to a client strategy + chosen lane + chosen offer.
 * Module 1–4 inputs are derived from the strategy and reused across spawned campaigns.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client_id = typeof body.client_id === "string" ? body.client_id : "";
    const strategy_id = typeof body.strategy_id === "string" ? body.strategy_id : "";
    const lane_id = typeof body.lane_id === "string" ? body.lane_id : "";
    const offer_id = typeof body.offer_id === "string" ? body.offer_id : "";
    const campaign_name = typeof body.campaign_name === "string" ? body.campaign_name.trim() : "";
    const idea_id = typeof body.idea_id === "string" ? body.idea_id : "";

    if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    if (!strategy_id) return NextResponse.json({ error: "strategy_id is required" }, { status: 400 });
    if (!lane_id) return NextResponse.json({ error: "lane_id is required" }, { status: 400 });
    if (!offer_id) return NextResponse.json({ error: "offer_id is required" }, { status: 400 });
    if (!campaign_name) return NextResponse.json({ error: "campaign_name is required" }, { status: 400 });

    const [sRes, laneRes, offerRes, ideaRes] = await Promise.all([
      supabase
        .from("client_strategies")
        .select("*")
        .eq("id", strategy_id)
        .eq("client_id", client_id)
        .maybeSingle(),
      supabase
        .from("strategy_icp_lanes")
        .select("*")
        .eq("id", lane_id)
        .eq("strategy_id", strategy_id)
        .maybeSingle(),
      supabase
        .from("strategy_offers")
        .select("*")
        .eq("id", offer_id)
        .eq("strategy_id", strategy_id)
        .maybeSingle(),
      idea_id
        ? supabase
            .from("strategy_lane_campaign_ideas")
            .select("*")
            .eq("id", idea_id)
            .eq("strategy_id", strategy_id)
            .eq("lane_id", lane_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]);

    if (sRes.error) return NextResponse.json({ error: sRes.error.message }, { status: 500 });
    if (laneRes.error) return NextResponse.json({ error: laneRes.error.message }, { status: 500 });
    if (offerRes.error) return NextResponse.json({ error: offerRes.error.message }, { status: 500 });
    if (ideaRes?.error) return NextResponse.json({ error: ideaRes.error.message }, { status: 500 });
    if (!sRes.data) return NextResponse.json({ error: "strategy not found" }, { status: 404 });
    if (!laneRes.data) return NextResponse.json({ error: "lane not found" }, { status: 404 });
    if (!offerRes.data) return NextResponse.json({ error: "offer not found" }, { status: 404 });
    if (idea_id && !ideaRes?.data) return NextResponse.json({ error: "idea not found" }, { status: 404 });

    const strategy = sRes.data as any;
    const lane = laneRes.data as any;
    const offer = offerRes.data as any;
    const idea = ideaRes?.data as any | null;

    const row: Record<string, unknown> = {
      client_id,
      name: campaign_name,

      // Linkage
      strategy_id,
      strategy_lane_id: lane_id,
      strategy_offer_id: offer_id,
      strategy_campaign_idea_id: idea?.id ?? null,
      strategy_campaign_idea_snapshot: idea
        ? {
            id: idea.id,
            name: idea.name,
            targeting_level: idea.targeting_level,
            list_filters: idea.list_filters,
            ai_strategy: idea.ai_strategy,
            value_prop: idea.value_prop,
            overview: idea.overview,
            requires_ai_personalization: idea.requires_ai_personalization,
            recommended_front_end_offer: idea.recommended_front_end_offer,
            meta: idea.meta ?? {},
          }
        : {},

      // Derive the old wizard fields from the strategy so tests have consistent context.
      what_they_do: strategy.what_they_do ?? null,
      measurable_outcome: strategy.measurable_outcome ?? null,
      timeline_claim: strategy.timeline_claim ?? null,
      named_results: strategy.named_results ?? null,
      core_pain: strategy.core_pain ?? null,

      // Keep offer_description as the chosen offer one-liner to ground Test 2.
      offer_description: offer.one_liner ?? null,
      offer_type_hint: null,

      // Headline ICP fields: derived from lane (kept as a string for legacy UI)
      icp_job_title: Array.isArray(lane.titles) ? lane.titles.join(", ") : null,
      icp_company_size: lane.company_size ?? null,
      icp_geography: lane.geography ?? null,
      target_industry: Array.isArray(lane.industries) ? lane.industries[0] ?? null : null,

      // Module 3 derived fields
      icp_refinement: {
        primary_titles: Array.isArray(lane.titles) ? lane.titles : [],
        secondary_titles: [],
        exclusions: Array.isArray(lane.exclusions) ? lane.exclusions : [],
      },
      signals_selected: Array.isArray(lane.signals) ? lane.signals : [],

      // Module 4: seed the pool with the chosen offer as #1, approved.
      offer_pool: [
        {
          id: `strategy:${offer.id}`,
          rank: 1,
          name: offer.name,
          one_liner: offer.one_liner,
          cta: offer.cta,
          rationale: offer.rationale ?? undefined,
          approved: true,
          generated_at: new Date().toISOString(),
        },
      ],

      // Carry down assets/constraints for Claude prompts
      available_assets: strategy.available_assets ?? {},

      status: "in_progress",
    };

    const { data, error } = await supabase.from("campaign_briefs").insert(row).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ brief: data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid JSON body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

