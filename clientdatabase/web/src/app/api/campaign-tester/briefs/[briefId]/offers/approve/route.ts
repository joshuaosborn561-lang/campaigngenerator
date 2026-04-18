import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Offer } from "@/lib/campaign-tester/brief-types";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * PATCH /api/campaign-tester/briefs/:briefId/offers/approve
 *
 * Body: { offer_id: string, approved: boolean }
 *
 * Flips `approved` on a single offer inside campaign_briefs.offer_pool.
 * No Claude call — pure state update.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const body = (await req.json()) as { offer_id?: string; approved?: boolean };
    if (!body.offer_id || typeof body.approved !== "boolean") {
      return NextResponse.json(
        { error: "offer_id and approved are required" },
        { status: 400 },
      );
    }

    const { data: brief, error: briefErr } = await supabase
      .from("campaign_briefs")
      .select("offer_pool")
      .eq("id", briefId)
      .maybeSingle();
    if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const pool: Offer[] = (brief.offer_pool as Offer[] | null) ?? [];
    const idx = pool.findIndex((o) => o.id === body.offer_id);
    if (idx < 0) {
      return NextResponse.json({ error: "offer_id not found in pool" }, { status: 404 });
    }

    const updated: Offer[] = pool.map((o, i) =>
      i === idx ? { ...o, approved: !!body.approved } : o,
    );

    const { error } = await supabase
      .from("campaign_briefs")
      .update({ offer_pool: updated })
      .eq("id", briefId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ offer_pool: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
