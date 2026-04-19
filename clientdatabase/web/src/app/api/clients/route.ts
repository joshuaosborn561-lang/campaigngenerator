import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { listClientsPicker } from "@/lib/clients-list";

/**
 * GET /api/clients — list clients (picker + directory).
 * POST /api/clients — onboard a new client.
 */
export async function GET() {
  const { clients, error } = await listClientsPicker();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const industry_vertical =
      typeof body.industry_vertical === "string" && body.industry_vertical.trim()
        ? body.industry_vertical.trim()
        : null;
    const smartlead_api_key =
      typeof body.smartlead_api_key === "string" && body.smartlead_api_key.trim()
        ? body.smartlead_api_key.trim()
        : null;
    const heyreach_api_key =
      typeof body.heyreach_api_key === "string" && body.heyreach_api_key.trim()
        ? body.heyreach_api_key.trim()
        : null;
    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const { data: row, error } = await supabase
      .from("clients")
      .insert({
        name,
        industry_vertical,
        notes,
      })
      .select("id, name, industry_vertical, created_at")
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json(
        { error: error.message },
        { status }
      );
    }

    const keyPatch: Record<string, string> = {};
    if (smartlead_api_key) keyPatch.smartlead = smartlead_api_key;
    if (heyreach_api_key) keyPatch.heyreach = heyreach_api_key;
    if (Object.keys(keyPatch).length > 0) {
      const { error: kerr } = await supabase.rpc("set_client_api_keys", {
        p_client_id: row.id,
        p_keys: keyPatch,
      });
      if (kerr) {
        return NextResponse.json({ error: kerr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ client: row });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
