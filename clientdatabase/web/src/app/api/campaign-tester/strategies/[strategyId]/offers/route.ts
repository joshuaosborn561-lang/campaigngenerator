import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ strategyId: string }> };

/**
 * GET /api/campaign-tester/strategies/:strategyId/offers
 * POST /api/campaign-tester/strategies/:strategyId/offers
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { strategyId } = await ctx.params;
  const { data, error } = await supabase
    .from("strategy_offers")
    .select("*")
    .eq("strategy_id", strategyId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offers: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { strategyId } = await ctx.params;
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const one_liner = typeof body.one_liner === "string" ? body.one_liner.trim() : "";
    const cta = typeof body.cta === "string" ? body.cta.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!one_liner) return NextResponse.json({ error: "one_liner is required" }, { status: 400 });
    if (!cta) return NextResponse.json({ error: "cta is required" }, { status: 400 });

    const row = {
      strategy_id: strategyId,
      name,
      one_liner,
      cta,
      rationale: typeof body.rationale === "string" ? body.rationale.trim() : null,
      tags: Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [],
      status: "active",
    };

    const { data, error } = await supabase.from("strategy_offers").insert(row).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ offer: data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid JSON body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

