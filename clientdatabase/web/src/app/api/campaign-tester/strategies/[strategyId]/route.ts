import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ strategyId: string }> };

/**
 * PATCH /api/campaign-tester/strategies/:strategyId
 * Partial update (onboarding json, name, truth pack fields if needed).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { strategyId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.what_they_do !== undefined) {
    patch.what_they_do = typeof body.what_they_do === "string" ? body.what_they_do.trim() : null;
  }
  if (body.measurable_outcome !== undefined) {
    patch.measurable_outcome =
      typeof body.measurable_outcome === "string" ? body.measurable_outcome.trim() : null;
  }
  if (body.core_pain !== undefined) {
    patch.core_pain = typeof body.core_pain === "string" ? body.core_pain.trim() : null;
  }
  const hasWizard =
    body.onboarding !== undefined ||
    typeof body.onboarding_step === "number" ||
    typeof body.onboarding_complete === "boolean";

  if (hasWizard) {
    const { data: cur, error: curE } = await supabase
      .from("client_strategies")
      .select("constraints")
      .eq("id", strategyId)
      .single();
    if (curE) {
      return NextResponse.json({ error: curE.message }, { status: 500 });
    }
    const fromBody =
      body.constraints !== null &&
      body.constraints !== undefined &&
      typeof body.constraints === "object" &&
      !Array.isArray(body.constraints)
        ? (body.constraints as Record<string, unknown>)
        : {};
    const base = (cur?.constraints && typeof cur.constraints === "object" ? cur.constraints : fromBody) as Record<
      string,
      unknown
    >;
    const w = (typeof base.salesglider_wizard === "object" && base.salesglider_wizard
      ? (base.salesglider_wizard as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    if (body.onboarding !== undefined) {
      w.data = body.onboarding === null ? {} : body.onboarding;
    }
    if (typeof body.onboarding_step === "number") w.step = body.onboarding_step;
    if (typeof body.onboarding_complete === "boolean") w.complete = body.onboarding_complete;
    patch.constraints = { ...base, ...fromBody, salesglider_wizard: w };
  } else if (body.constraints !== undefined) {
    if (body.constraints === null) {
      patch.constraints = {};
    } else if (typeof body.constraints === "object" && body.constraints !== null) {
      patch.constraints = body.constraints;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_strategies")
    .update(patch)
    .eq("id", strategyId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ strategy: data });
}
