import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import { buildBriefContextBlock } from "@/lib/campaign-tester/strategy-engine/context";
import { loadBriefForEngine } from "@/lib/campaign-tester/strategy-engine/load-brief";
import { copyQaSystemPrompt } from "@/lib/campaign-tester/strategy-engine/prompts";
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

    const body = await req.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const body_plain_text = typeof body.body_plain_text === "string" ? body.body_plain_text.trim() : "";
    if (!subject || !body_plain_text) {
      return NextResponse.json({ error: "subject and body_plain_text required" }, { status: 400 });
    }

    const om = loaded.engine.objection_map;
    const user = [
      buildBriefContextBlock(loaded.brief),
      om ? `\nOBJECTION MAP:\n${JSON.stringify(om).slice(0, 8000)}` : "",
      "\nCOPY TO REVIEW:\n",
      `SUBJECT: ${subject}\n\nBODY:\n${body_plain_text}`,
      "\nTASK: Return copy QA JSON only.",
    ].join("\n");

    const raw = await callClaude({
      system: copyQaSystemPrompt(),
      user,
      maxTokens: 2048,
      grounding: {
        clientId: loaded.brief.client_id ?? null,
        industryVertical: loaded.brief.target_industry ?? loaded.brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<Record<string, unknown>>(raw);

    const nextEngine = mergeEngineState(loaded.engine, {
      copy_qa: { ...parsed, reviewed_at: new Date().toISOString(), subject, body_plain_text },
    } as Partial<CampaignStrategyEngineState>);

    const { error } = await supabase
      .from("campaign_briefs")
      .update({ campaign_strategy_engine: nextEngine })
      .eq("id", briefId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ qa: parsed, campaign_strategy_engine: nextEngine });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
