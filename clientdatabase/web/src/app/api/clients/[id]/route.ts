import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/clients/[id] — client profile for hub (no raw API keys).
 * PATCH /api/clients/[id] — update fields; omit or empty string = leave unchanged for keys.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  const { data: row, error } = await supabase
    .from("clients")
    .select("id, name, industry_vertical, notes, smartlead_api_key, heyreach_api_key, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ count: campaignCount }, { count: briefCount }] = await Promise.all([
    supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("client_id", id),
    supabase.from("campaign_briefs").select("*", { count: "exact", head: true }).eq("client_id", id),
  ]);

  return NextResponse.json({
    client: {
      id: row.id,
      name: row.name,
      industry_vertical: row.industry_vertical,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      has_smartlead_key: Boolean(row.smartlead_api_key),
      has_heyreach_key: Boolean(row.heyreach_api_key),
    },
    stats: {
      campaigns: campaignCount ?? 0,
      briefs: briefCount ?? 0,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const patch: Record<string, string | null> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (body.industry_vertical !== undefined) {
      patch.industry_vertical =
        typeof body.industry_vertical === "string" && body.industry_vertical.trim()
          ? body.industry_vertical.trim()
          : null;
    }
    if (body.notes !== undefined) {
      patch.notes =
        typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }
    if (typeof body.smartlead_api_key === "string") {
      const v = body.smartlead_api_key.trim();
      patch.smartlead_api_key = v || null;
    }
    if (typeof body.heyreach_api_key === "string") {
      const v = body.heyreach_api_key.trim();
      patch.heyreach_api_key = v || null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clients")
      .update(patch)
      .eq("id", id)
      .select("id, name, industry_vertical, notes, created_at, updated_at")
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ client: data });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
