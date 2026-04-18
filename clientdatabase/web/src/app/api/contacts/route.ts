import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/contacts
 * Apollo-style contact search with filters, sorting, pagination.
 *
 * Query params:
 *   q          - full-text search (name, title, company)
 *   title      - job title filter (ilike)
 *   seniority  - c-suite, vp, director, manager, senior, entry
 *   department - sales, marketing, engineering, it, etc.
 *   company    - company name (ilike)
 *   industry   - company_industry (ilike)
 *   size       - company_size (eq)
 *   country    - country (eq)
 *   state      - state (eq)
 *   city       - city (ilike)
 *   status     - overall_status
 *   source     - source_platform
 *   tags       - comma-separated tags (cs/contains)
 *   meeting    - true/false
 *   sort       - column to sort by (default: created_at)
 *   order      - asc or desc (default: desc)
 *   page       - page number (default: 1)
 *   per_page   - results per page (default: 50, max: 200)
 *   client_id  - optional UUID; only contacts tied to this client's campaigns (via contact_campaigns)
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const page = Math.max(1, parseInt(params.get("page") || "1"));
    const perPage = Math.min(200, Math.max(1, parseInt(params.get("per_page") || "50")));
    const sortCol = params.get("sort") || "created_at";
    const sortOrder = params.get("order") === "asc";
    const offset = (page - 1) * perPage;

    const clientId = params.get("client_id");
    let contactIdFilter: string[] | null = null;

    if (clientId) {
      const { data: camps, error: campErr } = await supabase
        .from("campaigns")
        .select("id")
        .eq("client_id", clientId);

      if (campErr) {
        return NextResponse.json({ error: campErr.message }, { status: 500 });
      }

      const campIds = (camps ?? []).map((c) => c.id);
      if (campIds.length === 0) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          per_page: perPage,
          total_pages: 0,
        });
      }

      const { data: links, error: linkErr } = await supabase
        .from("contact_campaigns")
        .select("contact_id")
        .in("campaign_id", campIds);

      if (linkErr) {
        return NextResponse.json({ error: linkErr.message }, { status: 500 });
      }

      const unique = [...new Set((links ?? []).map((l) => l.contact_id))];
      if (unique.length === 0) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          per_page: perPage,
          total_pages: 0,
        });
      }

      contactIdFilter = unique;
    }

    // Build query
    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" });

    if (contactIdFilter) {
      query = query.in("id", contactIdFilter);
    }

    // Full-text search
    const q = params.get("q");
    if (q) {
      query = query.textSearch(
        "full_name",
        q,
        { type: "websearch", config: "english" }
      );
    }

    // Filter helpers
    const ilike = (col: string, param: string) => {
      const val = params.get(param);
      if (val) query = query.ilike(col, `%${val}%`);
    };
    const eq = (col: string, param: string) => {
      const val = params.get(param);
      if (val) query = query.eq(col, val);
    };

    ilike("title", "title");
    eq("seniority", "seniority");
    eq("department", "department");
    ilike("company_name", "company");
    ilike("company_industry", "industry");
    eq("company_size", "size");
    eq("country", "country");
    eq("state", "state");
    ilike("city", "city");
    eq("overall_status", "status");
    eq("source_platform", "source");

    const meeting = params.get("meeting");
    if (meeting === "true") query = query.eq("meeting_booked", true);
    if (meeting === "false") query = query.eq("meeting_booked", false);

    const tags = params.get("tags");
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tagList);
    }

    // Sort + paginate
    query = query
      .order(sortCol, { ascending: sortOrder })
      .range(offset, offset + perPage - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
