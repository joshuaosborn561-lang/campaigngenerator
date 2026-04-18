import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import {
  INITIAL_OFFER_SYSTEM_PROMPT,
  buildInitialOfferPrompt,
  hydrateInitialOffers,
  type InitialOfferResponse,
  type OfferBriefContext,
} from "@/lib/campaign-tester/offer-generation";
import type { BriefRecord, Offer, OfferConversationMessage } from "@/lib/campaign-tester/brief-types";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

function briefToContext(brief: BriefRecord): OfferBriefContext {
  return {
    client_name: brief.clients?.name ?? null,
    what_they_do: brief.what_they_do,
    measurable_outcome: brief.measurable_outcome,
    timeline_claim: brief.timeline_claim,
    named_results: brief.named_results,
    risk_tolerance: brief.risk_tolerance,
    core_pain: brief.core_pain,
    offer_description: brief.offer_description,
    icp_job_title: brief.icp_job_title,
    icp_company_size: brief.icp_company_size,
    icp_geography: brief.icp_geography,
    target_industry: brief.target_industry,
    available_assets: brief.available_assets,
    available_plays: brief.available_plays,
    signals_selected: brief.signals_selected,
    icp_refinement: brief.icp_refinement,
    apollo_filters: brief.apollo_filters,
  };
}

/**
 * GET /api/campaign-tester/briefs/:briefId/offers
 * Return the current offer pool + the conversation log (if any).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { briefId } = await ctx.params;

  const [briefRes, convoRes] = await Promise.all([
    supabase
      .from("campaign_briefs")
      .select("offer_pool")
      .eq("id", briefId)
      .maybeSingle(),
    supabase
      .from("offer_conversations")
      .select("*")
      .eq("brief_id", briefId)
      .maybeSingle(),
  ]);

  if (briefRes.error) return NextResponse.json({ error: briefRes.error.message }, { status: 500 });
  if (!briefRes.data) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  return NextResponse.json({
    offer_pool: (briefRes.data.offer_pool as Offer[] | null) ?? [],
    conversation: convoRes.data ?? null,
  });
}

/**
 * POST /api/campaign-tester/briefs/:briefId/offers
 * Generates an initial pool of 10 offers via Claude (or regenerates from scratch).
 * Replaces any existing offer_pool on the brief.
 * Resets the conversation to a single system bookmark so chat starts fresh.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;

    const { data: briefRow, error: briefErr } = await supabase
      .from("campaign_briefs")
      .select("*, clients (id, name, industry_vertical)")
      .eq("id", briefId)
      .maybeSingle();
    if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
    if (!briefRow) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const brief = briefRow as unknown as BriefRecord;

    const user = buildInitialOfferPrompt(briefToContext(brief));
    const raw = await callClaude({
      system: INITIAL_OFFER_SYSTEM_PROMPT,
      user,
      maxTokens: 3500,
      grounding: {
        clientId: brief.client_id ?? null,
        industryVertical: brief.target_industry ?? brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<InitialOfferResponse>(raw);
    const offers = hydrateInitialOffers(parsed);

    // Persist onto the brief.
    const { error: upErr } = await supabase
      .from("campaign_briefs")
      .update({ offer_pool: offers })
      .eq("id", briefId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Reset/initialize the conversation with an assistant-turn snapshot.
    const nowIso = new Date().toISOString();
    const assistantMsg: OfferConversationMessage = {
      role: "assistant",
      content:
        "Here are 10 offer ideas grounded in the brief. Approve the ones you like and chat with me to reshape the rest.",
      offer_snapshot: offers,
      created_at: nowIso,
    };
    await supabase
      .from("offer_conversations")
      .upsert(
        {
          brief_id: briefId,
          messages: [assistantMsg],
        },
        { onConflict: "brief_id" },
      );

    return NextResponse.json({
      offer_pool: offers,
      assistant_message: assistantMsg,
      debug:
        process.env.NODE_ENV === "development"
          ? { system: INITIAL_OFFER_SYSTEM_PROMPT, user, raw }
          : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("[offers:init] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
