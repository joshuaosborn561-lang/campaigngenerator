import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/campaign-tester/strategies?client_id=...
 * POST /api/campaign-tester/strategies
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id") ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_strategies")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategies: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client_id = typeof body.client_id === "string" ? body.client_id : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const row = {
      client_id,
      name,
      what_they_do: typeof body.what_they_do === "string" ? body.what_they_do.trim() : null,
      measurable_outcome:
        typeof body.measurable_outcome === "string" ? body.measurable_outcome.trim() : null,
      timeline_claim: typeof body.timeline_claim === "string" ? body.timeline_claim.trim() : null,
      named_results: typeof body.named_results === "string" ? body.named_results.trim() : null,
      core_pain: typeof body.core_pain === "string" ? body.core_pain.trim() : null,
      constraints: body.constraints && typeof body.constraints === "object" ? body.constraints : {},
      available_assets:
        body.available_assets && typeof body.available_assets === "object" ? body.available_assets : {},
      status: "active",
    };

    const { data, error } = await supabase.from("client_strategies").insert(row).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ strategy: data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid JSON body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

