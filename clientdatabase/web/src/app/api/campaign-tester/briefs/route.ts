import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/campaign-tester/briefs
 * List all briefs, newest first. Optional ?status= filter.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const clientId = req.nextUrl.searchParams.get("client_id");

  let q = supabase
    .from("campaign_briefs")
    .select("*, clients (id, name, industry_vertical)")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (clientId) q = q.eq("client_id", clientId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ briefs: data ?? [] });
}

/**
 * POST /api/campaign-tester/briefs
 * Create a new brief.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const row = {
      client_id: body.client_id ?? null,
      name: body.name,
      icp_job_title: body.icp_job_title ?? null,
      icp_company_size: body.icp_company_size ?? null,
      icp_geography: body.icp_geography ?? null,
      target_industry: body.target_industry ?? null,
      offer_description: body.offer_description ?? null,
      offer_type_hint: body.offer_type_hint ?? null,
      available_assets: body.available_assets ?? {},
      infrastructure_status: body.infrastructure_status ?? {},
      available_plays: body.available_plays ?? [],
      status: "in_progress",
    };

    const { data, error } = await supabase
      .from("campaign_briefs")
      .insert(row)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ brief: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
