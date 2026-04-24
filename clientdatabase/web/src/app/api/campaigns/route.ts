import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/campaigns?client_id=...
 * List synced live campaigns (warehouse) for a client.
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id")?.trim() ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, source_platform, status, send_volume, reply_rate, positive_reply_count, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ campaigns: data ?? [] });
}
