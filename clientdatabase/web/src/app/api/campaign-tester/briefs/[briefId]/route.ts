import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * GET /api/campaign-tester/briefs/:briefId
 * Return the brief with all of its test_runs.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { briefId } = await ctx.params;

  const { data: brief, error: briefErr } = await supabase
    .from("campaign_briefs")
    .select("*")
    .eq("id", briefId)
    .maybeSingle();

  if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
  if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  const { data: testRuns, error: runsErr } = await supabase
    .from("test_runs")
    .select("*")
    .eq("brief_id", briefId)
    .order("test_number", { ascending: true });
  if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 });

  return NextResponse.json({ brief, test_runs: testRuns ?? [] });
}

/**
 * PATCH /api/campaign-tester/briefs/:briefId
 * Partial update — used to persist infrastructure_status mid-wizard, or to
 * mark a brief complete/abandoned.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const updates = await req.json();

    const allowed = [
      "name",
      // Module 1 — core brief
      "what_they_do",
      "measurable_outcome",
      "timeline_claim",
      "named_results",
      "risk_tolerance",
      "core_pain",
      "offer_description",
      "offer_type_hint",
      // Module 1 — headline ICP
      "icp_job_title",
      "icp_company_size",
      "icp_geography",
      "target_industry",
      // Module 2
      "monthly_email_volume",
      "infra_calc",
      "infrastructure_status",
      // Module 3
      "icp_refinement",
      "signals_selected",
      "apollo_filters",
      // Module 4
      "offer_pool",
      "campaign_strategy_engine",
      // Other
      "available_assets",
      "available_plays",
      "progress",
      "status",
    ];
    const cleaned: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) cleaned[key] = updates[key];
    }

    if (Object.keys(cleaned).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("campaign_briefs")
      .update(cleaned)
      .eq("id", briefId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brief: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/campaign-tester/briefs/:briefId
 * Cascade-deletes all test_runs tied to this brief.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { briefId } = await ctx.params;
  const { error } = await supabase
    .from("campaign_briefs")
    .delete()
    .eq("id", briefId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
