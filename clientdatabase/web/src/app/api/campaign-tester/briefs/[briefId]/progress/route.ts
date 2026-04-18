import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { BriefProgress, ModuleKey } from "@/lib/campaign-tester/brief-types";
import { MODULE_ORDER } from "@/lib/campaign-tester/brief-types";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * PATCH /api/campaign-tester/briefs/:briefId/progress
 *
 * Body: { module: ModuleKey, complete: boolean }
 *
 * Flips a single module flag in the brief's `progress` jsonb without
 * touching any other columns. Enforces sequential gating — you cannot
 * mark module N complete unless modules 1..N-1 are complete.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const body = (await req.json()) as { module: ModuleKey; complete: boolean };

    if (!body.module || !MODULE_ORDER.includes(body.module)) {
      return NextResponse.json(
        { error: `module must be one of ${MODULE_ORDER.join(", ")}` },
        { status: 400 },
      );
    }

    // Load current progress.
    const { data: brief, error: briefErr } = await supabase
      .from("campaign_briefs")
      .select("progress")
      .eq("id", briefId)
      .maybeSingle();
    if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const progress: BriefProgress = {
      module_1_brief: false,
      module_2_infra: false,
      module_3_icp: false,
      module_4_offers: false,
      module_5_tests: false,
      ...(brief.progress ?? {}),
    };

    // Sequential gating — cannot complete module N unless 1..N-1 done.
    if (body.complete) {
      const idx = MODULE_ORDER.indexOf(body.module);
      for (let i = 0; i < idx; i++) {
        if (!progress[MODULE_ORDER[i]]) {
          return NextResponse.json(
            {
              error: `Cannot complete ${body.module} — prerequisite ${MODULE_ORDER[i]} is not yet complete.`,
            },
            { status: 409 },
          );
        }
      }
    }

    progress[body.module] = !!body.complete;

    const { data, error } = await supabase
      .from("campaign_briefs")
      .update({ progress })
      .eq("id", briefId)
      .select("progress")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ progress: data.progress });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
