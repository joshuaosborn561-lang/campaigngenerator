import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import {
  REFINEMENT_SYSTEM_PROMPT,
  buildRefinementPrompt,
  hydrateRefinedOffers,
  type OfferBriefContext,
  type RefinementResponse,
} from "@/lib/campaign-tester/offer-generation";
import type {
  BriefRecord,
  Offer,
  OfferConversationMessage,
  OfferConversationRecord,
} from "@/lib/campaign-tester/brief-types";

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
 * POST /api/campaign-tester/briefs/:briefId/offers/chat
 *
 * Body: { message: string }
 *
 * Appends the user's message to the conversation, calls Claude with the
 * brief + current pool + full history + latest instruction, and persists
 * both the refined offer pool and the assistant turn back to Supabase.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const body = (await req.json()) as { message?: string };
    const userMessage = (body.message ?? "").trim();
    if (!userMessage) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Load brief + current pool + conversation.
    const [briefRes, convoRes] = await Promise.all([
      supabase
        .from("campaign_briefs")
        .select("*, clients (id, name, industry_vertical)")
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

    const brief = briefRes.data as unknown as BriefRecord;
    const currentPool = (brief.offer_pool as Offer[] | null) ?? [];
    if (currentPool.length === 0) {
      return NextResponse.json(
        { error: "No offer pool yet — generate the initial 10 first (POST /offers)." },
        { status: 409 },
      );
    }

    const convo = convoRes.data as OfferConversationRecord | null;
    const history: OfferConversationMessage[] = convo?.messages ?? [];
    const nowIso = new Date().toISOString();

    const userTurn: OfferConversationMessage = {
      role: "user",
      content: userMessage,
      created_at: nowIso,
    };

    // Call Claude.
    const engine = (brief as unknown as { campaign_strategy_engine?: Record<string, unknown> | null })
      .campaign_strategy_engine;
    const objectionMap = engine?.objection_map;
    const extra =
      objectionMap && typeof objectionMap === "object"
        ? `OBJECTION MAP:\n${JSON.stringify(objectionMap).slice(0, 12000)}`
        : undefined;

    const prompt = buildRefinementPrompt({
      brief: briefToContext(brief),
      currentPool,
      history,
      latestUserMessage: userMessage,
      extraContext: extra,
    });

    const raw = await callClaude({
      system: REFINEMENT_SYSTEM_PROMPT,
      user: prompt,
      maxTokens: 3500,
      grounding: {
        clientId: brief.client_id ?? null,
        industryVertical: brief.target_industry ?? brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<RefinementResponse>(raw);
    const refined = hydrateRefinedOffers(parsed, currentPool);

    const assistantTurn: OfferConversationMessage = {
      role: "assistant",
      content: parsed.assistant_message || "Updated the pool per your instruction.",
      offer_snapshot: refined,
      created_at: new Date().toISOString(),
    };

    const nextMessages = [...history, userTurn, assistantTurn];

    // Persist — conversation + brief.offer_pool updated atomically from the
    // client's perspective (no DB txn across 2 tables, but failures are
    // recoverable because both writes are idempotent).
    await Promise.all([
      supabase
        .from("offer_conversations")
        .upsert(
          { brief_id: briefId, messages: nextMessages },
          { onConflict: "brief_id" },
        ),
      supabase
        .from("campaign_briefs")
        .update({ offer_pool: refined })
        .eq("id", briefId),
    ]);

    return NextResponse.json({
      offer_pool: refined,
      assistant_message: assistantTurn,
      messages: nextMessages,
      debug:
        process.env.NODE_ENV === "development"
          ? { system: REFINEMENT_SYSTEM_PROMPT, user: prompt, raw }
          : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("[offers:chat] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
