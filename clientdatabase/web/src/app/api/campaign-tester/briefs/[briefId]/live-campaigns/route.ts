import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

/**
 * GET /api/campaign-tester/briefs/:briefId/live-campaigns
 *
 * Lists live campaigns in the `campaigns` table that belong to the same
 * client as this brief — so the UI can offer them as link targets for
 * completed test_runs. Once linked, the SmartLead / HeyReach nightly sync
 * automatically feeds performance (sends, replies, meetings) back onto the
 * test, giving you an after-the-fact view of what worked.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { briefId } = await ctx.params;

  const { data: brief, error: briefErr } = await supabase
    .from("campaign_briefs")
    .select("client_id")
    .eq("id", briefId)
    .maybeSingle();
  if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
  if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  let q = supabase
    .from("campaigns")
    .select(
      "id, name, status, source_platform, send_volume, open_rate, reply_rate, positive_reply_count, meetings_booked, meetings_per_500, campaign_start_date"
    )
    .order("campaign_start_date", { ascending: false, nullsFirst: false })
    .limit(200);

  if (brief.client_id) {
    q = q.eq("client_id", brief.client_id);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}
