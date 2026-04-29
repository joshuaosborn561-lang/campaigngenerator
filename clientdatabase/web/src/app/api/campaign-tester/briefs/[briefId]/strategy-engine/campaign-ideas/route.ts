import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import { buildBriefContextBlock } from "@/lib/campaign-tester/strategy-engine/context";
import { loadBriefForEngine } from "@/lib/campaign-tester/strategy-engine/load-brief";
import { campaignIdeasSystemPrompt } from "@/lib/campaign-tester/strategy-engine/prompts";
import { mergeEngineState } from "@/lib/campaign-tester/strategy-engine/wrap-json";
import type { CampaignStrategyEngineState } from "@/lib/campaign-tester/strategy-engine/types";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const loaded = await loadBriefForEngine(briefId);
    if (!loaded) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const operatorNotes =
      typeof body.operator_notes === "string" ? body.operator_notes.trim().slice(0, 4000) : "";

    const om = loaded.engine.objection_map;
    const parts = [
      buildBriefContextBlock(loaded.brief),
      om ? `\nOBJECTION MAP (use to sharpen angles):\n${JSON.stringify(om).slice(0, 12000)}` : "",
      operatorNotes ? `\nOPERATOR NOTES:\n${operatorNotes}` : "",
      "\nTASK: Produce the ideas JSON object with key ideas (array) only.",
    ];

    const raw = await callClaude({
      system: campaignIdeasSystemPrompt(),
      user: parts.join("\n"),
      maxTokens: 8192,
      grounding: {
        clientId: loaded.brief.client_id ?? null,
        industryVertical: loaded.brief.target_industry ?? loaded.brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<{ ideas?: Record<string, unknown>[] }>(raw);
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];

    const nextEngine = mergeEngineState(loaded.engine, {
      campaign_ideas: {
        ideas,
        generated_at: new Date().toISOString(),
      },
    } as Partial<CampaignStrategyEngineState>);

    const { error } = await supabase
      .from("campaign_briefs")
      .update({ campaign_strategy_engine: nextEngine })
      .eq("id", briefId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ideas,
      count: ideas.length,
      campaign_strategy_engine: nextEngine,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
