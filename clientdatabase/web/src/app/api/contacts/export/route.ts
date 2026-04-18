import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/contacts/export
 * Export contacts to CSV.
 *
 * Body:
 *   ids?     - array of contact IDs to export (if empty, exports current filter)
 *   filters? - same filter object as search (for exporting filtered results)
 *   columns? - array of column names to include (default: all)
 */

const ALL_COLUMNS = [
  "email", "first_name", "last_name", "title", "seniority", "department",
  "linkedin_url", "company_name", "company_domain", "company_industry",
  "company_size", "company_revenue", "city", "state", "country", "phone",
  "tags", "source_platform", "source_list", "total_campaigns",
  "total_emails_sent", "total_replies", "overall_status", "meeting_booked",
  "last_contacted_at", "last_replied_at", "created_at",
];

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = Array.isArray(val) ? val.join("; ") : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const columns: string[] = body.columns || ALL_COLUMNS;
    const ids: string[] | undefined = body.ids;
    const filters = body.filters || {};

    let query = supabase.from("contacts").select(columns.join(","));

    // If specific IDs provided, use those
    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    } else {
      // Apply same filters as search
      if (filters.q) {
        query = query.textSearch("full_name", filters.q, {
          type: "websearch",
          config: "english",
        });
      }
      if (filters.title) query = query.ilike("title", `%${filters.title}%`);
      if (filters.seniority) query = query.eq("seniority", filters.seniority);
      if (filters.department) query = query.eq("department", filters.department);
      if (filters.company) query = query.ilike("company_name", `%${filters.company}%`);
      if (filters.industry) query = query.ilike("company_industry", `%${filters.industry}%`);
      if (filters.size) query = query.eq("company_size", filters.size);
      if (filters.country) query = query.eq("country", filters.country);
      if (filters.state) query = query.eq("state", filters.state);
      if (filters.city) query = query.ilike("city", `%${filters.city}%`);
      if (filters.status) query = query.eq("overall_status", filters.status);
      if (filters.source) query = query.eq("source_platform", filters.source);
      if (filters.meeting === "true") query = query.eq("meeting_booked", true);
    }

    // Limit export to 10k rows
    query = query.limit(10000);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build CSV
    const header = columns.map((c) => escapeCSV(c)).join(",");
    const rows = (data || []).map((row: any) =>
      columns.map((c) => escapeCSV(row[c])).join(",")
    );
    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="contacts-export-${Date.now()}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
