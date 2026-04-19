import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ strategyId: string }> };

/**
 * GET /api/campaign-tester/strategies/:strategyId/lanes
 * POST /api/campaign-tester/strategies/:strategyId/lanes
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { strategyId } = await ctx.params;
  const { data, error } = await supabase
    .from("strategy_icp_lanes")
    .select("*")
    .eq("strategy_id", strategyId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lanes: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { strategyId } = await ctx.params;
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const row = {
      strategy_id: strategyId,
      name,
      description: typeof body.description === "string" ? body.description.trim() : null,
      titles: Array.isArray(body.titles) ? body.titles.map(String).filter(Boolean) : [],
      seniority: Array.isArray(body.seniority) ? body.seniority.map(String).filter(Boolean) : [],
      departments: Array.isArray(body.departments) ? body.departments.map(String).filter(Boolean) : [],
      industries: Array.isArray(body.industries) ? body.industries.map(String).filter(Boolean) : [],
      company_size: typeof body.company_size === "string" ? body.company_size.trim() : null,
      geography: typeof body.geography === "string" ? body.geography.trim() : null,
      exclusions: Array.isArray(body.exclusions) ? body.exclusions.map(String).filter(Boolean) : [],
      signals: Array.isArray(body.signals) ? body.signals.map(String).filter(Boolean) : [],
      status: "active",
    };

    const { data, error } = await supabase
      .from("strategy_icp_lanes")
      .insert(row)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lane: data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid JSON body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

