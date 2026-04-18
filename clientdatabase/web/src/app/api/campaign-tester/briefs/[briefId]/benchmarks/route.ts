import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { loadBenchmarks } from "@/lib/campaign-tester/benchmark-query";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * GET /api/campaign-tester/briefs/:briefId/benchmarks
 * Looks up historical campaigns that match the brief's ICP axes. Additional
 * query params can narrow further (offer_type, play_used, lead_source) —
 * useful mid-wizard when the user has already chosen one of those.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { briefId } = await ctx.params;
  const extra = {
    offer_type: req.nextUrl.searchParams.get("offer_type") ?? undefined,
    play_used: req.nextUrl.searchParams.get("play_used") ?? undefined,
    lead_source: req.nextUrl.searchParams.get("lead_source") ?? undefined,
  };

  const { data: brief, error } = await supabase
    .from("campaign_briefs")
    .select("target_industry, icp_company_size")
    .eq("id", briefId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  try {
    const result = await loadBenchmarks({
      target_industry: brief.target_industry,
      icp_company_size: brief.icp_company_size,
      ...extra,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
