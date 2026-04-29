import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import { buildBriefContextBlock } from "@/lib/campaign-tester/strategy-engine/context";
import { loadBriefForEngine } from "@/lib/campaign-tester/strategy-engine/load-brief";
import { scoreOffersSystemPrompt } from "@/lib/campaign-tester/strategy-engine/prompts";
import { mergeEngineState } from "@/lib/campaign-tester/strategy-engine/wrap-json";
import type { CampaignStrategyEngineState, OfferScoreRow } from "@/lib/campaign-tester/strategy-engine/types";
import type { Offer } from "@/lib/campaign-tester/brief-types";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

function normalizeScores(raw: unknown, pool: Offer[]): OfferScoreRow[] {
  const arr =
    raw &&
    typeof raw === "object" &&
    "scores" in (raw as Record<string, unknown>) &&
    Array.isArray((raw as { scores: unknown }).scores)
      ? ((raw as { scores: unknown[] }).scores ?? [])
      : [];
  const out: OfferScoreRow[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const offer_id = String(o.offer_id ?? "").trim();
    if (!offer_id) continue;
    const dims = ["icp_specificity", "pain_relevance", "listability", "offer_strength", "reply_likelihood"] as const;
    const dimVals: Record<string, number> = {};
    let sum = 0;
    for (const k of dims) {
      const n = Number(o[k]);
      const v = Number.isFinite(n) ? Math.max(0, Math.min(20, Math.round(n))) : 0;
      dimVals[k] = v;
      sum += v;
    }
    const total =
      typeof o.total === "number" && Number.isFinite(o.total)
        ? Math.max(0, Math.min(100, Math.round(o.total)))
        : sum;
    const pass = typeof o.pass === "boolean" ? o.pass : total >= 80;
    out.push({
      offer_id,
      icp_specificity: dimVals.icp_specificity,
      pain_relevance: dimVals.pain_relevance,
      listability: dimVals.listability,
      offer_strength: dimVals.offer_strength,
      reply_likelihood: dimVals.reply_likelihood,
      total,
      pass,
      notes: String(o.notes ?? "").slice(0, 500),
    });
  }
  const poolIds = new Set(pool.map((p) => p.id));
  return out.filter((s) => poolIds.has(s.offer_id));
}

export async function POST(_req: Request, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const loaded = await loadBriefForEngine(briefId);
    if (!loaded) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const pool = (loaded.brief.offer_pool as Offer[] | null) ?? [];
    if (!pool.length) {
      return NextResponse.json({ error: "No offer pool yet — generate offers in Module 4 first." }, { status: 400 });
    }

    const user = [
      buildBriefContextBlock(loaded.brief),
      "\nOFFERS TO SCORE (use offer_id exactly):\n",
      JSON.stringify(
        pool.map((o) => ({
          offer_id: o.id,
          rank: o.rank,
          name: o.name,
          one_liner: o.one_liner,
          cta: o.cta,
          rationale: o.rationale,
        })),
        null,
        2
      ),
      "\nTASK: Return scores JSON only.",
    ].join("\n");

    const raw = await callClaude({
      system: scoreOffersSystemPrompt(),
      user,
      maxTokens: 4096,
      grounding: {
        clientId: loaded.brief.client_id ?? null,
        industryVertical: loaded.brief.target_industry ?? loaded.brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<unknown>(raw);
    const rows = normalizeScores(parsed, pool);

    const nextEngine = mergeEngineState(loaded.engine, {
      offer_scores: rows,
    } as Partial<CampaignStrategyEngineState>);

    const { error } = await supabase
      .from("campaign_briefs")
      .update({ campaign_strategy_engine: nextEngine })
      .eq("id", briefId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ scores: rows, campaign_strategy_engine: nextEngine });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
