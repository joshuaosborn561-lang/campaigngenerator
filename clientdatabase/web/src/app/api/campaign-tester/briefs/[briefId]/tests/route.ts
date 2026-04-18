import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getTest } from "@/lib/campaign-tester/knowledge-base";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * POST /api/campaign-tester/briefs/:briefId/tests
 *
 * Body: {
 *   test_number: 1 | 2 | 3 | 4 | 5 | 6,
 *   variant_chosen: string,   // for Test 1, use "passed" or "failed"
 *   target_metric?: string,   // defaults to the test's success metric
 *   generated_output?: any,   // JSON blob from /generate
 *   campaign_id?: string      // optional link to a live campaign
 * }
 *
 * Upserts on (brief_id, test_number) so a user retaking a test overwrites
 * the prior run.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const body = await req.json();
    const testNumber = Number(body.test_number);

    if (![1, 2, 3, 4, 5, 6].includes(testNumber)) {
      return NextResponse.json(
        { error: "test_number must be 1..6" },
        { status: 400 }
      );
    }

    const test = getTest(testNumber);
    if (!test) {
      return NextResponse.json({ error: "Unknown test" }, { status: 400 });
    }

    if (!body.variant_chosen || typeof body.variant_chosen !== "string") {
      return NextResponse.json(
        { error: "variant_chosen required" },
        { status: 400 }
      );
    }

    const row = {
      brief_id: briefId,
      test_number: testNumber,
      variable_tested: test.variableTested,
      variant_chosen: body.variant_chosen,
      target_metric: body.target_metric ?? test.successMetric,
      generated_output: body.generated_output ?? null,
      campaign_id: body.campaign_id ?? null,
    };

    const { data, error } = await supabase
      .from("test_runs")
      .upsert(row, { onConflict: "brief_id,test_number" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ test_run: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/campaign-tester/briefs/:briefId/tests
 * List all test_runs for this brief.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { briefId } = await ctx.params;
  const { data, error } = await supabase
    .from("test_runs")
    .select("*")
    .eq("brief_id", briefId)
    .order("test_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ test_runs: data ?? [] });
}
