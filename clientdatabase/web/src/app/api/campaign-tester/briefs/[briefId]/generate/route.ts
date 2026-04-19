import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import {
  buildPromptForTest,
  buildGenerationSystemPrompt,
  type GenerationRequest,
  type PriorTestWinner,
} from "@/lib/campaign-tester/prompts";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * POST /api/campaign-tester/briefs/:briefId/generate
 *
 * Body: {
 *   test_number: 2 | 3 | 4 | 5 | 6,
 *   variant_id: string,
 *   sub_variants?: Record<string, string>
 * }
 *
 * Returns the parsed JSON Claude returned. This route does NOT persist the
 * test_run — the UI calls POST /tests after the user reviews + accepts the
 * generated output.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const body = await req.json();
    const testNumber = Number(body.test_number);
    const variantId = String(body.variant_id ?? "");
    const subVariants: Record<string, string> | undefined = body.sub_variants;

    if (![2, 3, 4, 5, 6].includes(testNumber)) {
      return NextResponse.json(
        { error: "test_number must be 2, 3, 4, 5, or 6 (Test 1 is a checklist)" },
        { status: 400 }
      );
    }
    if (!variantId && !subVariants) {
      return NextResponse.json(
        { error: "variant_id or sub_variants required" },
        { status: 400 }
      );
    }

    // Load the brief.
    const { data: brief, error: briefErr } = await supabase
      .from("campaign_briefs")
      .select("*, clients (industry_vertical)")
      .eq("id", briefId)
      .maybeSingle();
    if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    // Load prior winners from test_runs (any test_number < current).
    const { data: runs, error: runsErr } = await supabase
      .from("test_runs")
      .select("test_number, variable_tested, variant_chosen")
      .eq("brief_id", briefId)
      .lt("test_number", testNumber)
      .order("test_number", { ascending: true });
    if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 });

    const priorWinners: PriorTestWinner[] = (runs ?? []).map((r) => ({
      test_number: r.test_number,
      variable_tested: r.variable_tested,
      variant_chosen: r.variant_chosen,
    }));

    const request: GenerationRequest = {
      brief: {
        name: brief.name,
        icp_job_title: brief.icp_job_title,
        icp_company_size: brief.icp_company_size,
        icp_geography: brief.icp_geography,
        target_industry: brief.target_industry,
        offer_description: brief.offer_description,
        offer_type_hint: brief.offer_type_hint,
        available_assets: brief.available_assets,
        infrastructure_status: brief.infrastructure_status,
        available_plays: brief.available_plays,
      },
      priorWinners,
      testNumber,
      variantId,
      subVariants,
      customOffers: Array.isArray(brief.offer_pool)
        ? (brief.offer_pool as GenerationRequest["customOffers"])
        : undefined,
    };

    const userPrompt = buildPromptForTest(request);
    const clientIndustry =
      (brief.clients as { industry_vertical?: string | null } | null)?.industry_vertical ?? null;

    const raw = await callClaude({
      system: buildGenerationSystemPrompt(),
      user: userPrompt,
      maxTokens: testNumber === 6 ? 4096 : 2048,
      grounding: {
        clientId: (brief.client_id as string | null) ?? null,
        industryVertical: (brief.target_industry as string | null) ?? clientIndustry,
      },
    });

    const parsed = parseJsonFromClaude<Record<string, unknown>>(raw);

    return NextResponse.json({
      generated: parsed,
      // Expose the raw prompt + raw response for debugging in dev builds.
      debug:
        process.env.NODE_ENV === "development"
          ? { system: buildGenerationSystemPrompt(), user: userPrompt, raw }
          : undefined,
    });
  } catch (err: any) {
    console.error("campaign-tester generate error:", err);
    return NextResponse.json(
      { error: err.message || "Generation failed" },
      { status: 500 }
    );
  }
}
