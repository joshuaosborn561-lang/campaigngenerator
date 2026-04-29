import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import { buildBriefContextBlock } from "@/lib/campaign-tester/strategy-engine/context";
import { loadBriefForEngine } from "@/lib/campaign-tester/strategy-engine/load-brief";
import { objectionMapSystemPrompt } from "@/lib/campaign-tester/strategy-engine/prompts";
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

    const user = [
      buildBriefContextBlock(loaded.brief),
      operatorNotes ? `\nOPERATOR NOTES:\n${operatorNotes}` : "",
      "\nTASK: Produce the objection_map JSON object only.",
    ].join("\n");

    const raw = await callClaude({
      system: objectionMapSystemPrompt(),
      user,
      maxTokens: 4096,
      grounding: {
        clientId: loaded.brief.client_id ?? null,
        industryVertical: loaded.brief.target_industry ?? loaded.brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<Record<string, unknown>>(raw);
    const nextEngine = mergeEngineState(loaded.engine, {
      objection_map: parsed,
    } as Partial<CampaignStrategyEngineState>);

    const { error } = await supabase
      .from("campaign_briefs")
      .update({ campaign_strategy_engine: nextEngine })
      .eq("id", briefId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ objection_map: parsed, campaign_strategy_engine: nextEngine });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
