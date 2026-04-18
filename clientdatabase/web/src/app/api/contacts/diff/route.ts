import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  bulkEnrichAll,
  type ProspeoPersonInput,
  type ProspeoEnrichedPerson,
} from "@/lib/prospeo";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/contacts/diff
 *
 * Accepts a CSV file (Apollo export) and returns an XLSX file with original
 * columns plus added diff columns showing which contacts already exist in
 * Supabase, so the user can avoid burning Apollo email-reveal credits on
 * contacts they already have.
 *
 * Match priority:
 *   1. LinkedIn URL exact match (best — Apollo gives this for free)
 *   2. Email exact match (only if Apollo already revealed it)
 *   3. (first_name + last_name + company_name) case-insensitive match
 */

// Apollo CSV column name aliases — handles different export formats
const COLUMN_ALIASES: Record<string, string[]> = {
  first_name: ["first name", "firstname", "first_name", "given name"],
  last_name: ["last name", "lastname", "last_name", "surname", "family name"],
  email: ["email", "email address", "work email", "person email"],
  linkedin_url: [
    "person linkedin url",
    "linkedin url",
    "linkedin",
    "personal linkedin url",
    "linkedin profile",
  ],
  company_name: ["company", "company name", "organization", "employer", "company name for emails"],
  title: ["title", "job title", "position"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// Normalize a LinkedIn URL for matching (strip protocol, trailing slash, query params)
function normalizeLinkedIn(url: string | undefined): string | null {
  if (!url) return null;
  let u = url.toLowerCase().trim();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "");
  u = u.split("?")[0].split("#")[0];
  u = u.replace(/\/$/, "");
  return u || null;
}

function normalizeKey(s: string | undefined | null): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

interface DiffRow {
  original: Record<string, unknown>;
  in_database: "yes" | "no";
  match_method: string;
  db_id: string;
  db_status: string;
  db_first_seen: string;
  db_last_contacted: string;
  db_emails_sent: number | string;
  db_replies: number | string;
  db_meeting_booked: string;
  db_source: string;
  db_tags: string;
  // Prospeo enrichment fields
  prospeo_email: string;
  prospeo_email_status: string;
  prospeo_method: string;
  prospeo_error: string;
}

function extractDomain(company?: string, email?: string): string | undefined {
  if (email && email.includes("@")) return email.split("@")[1];
  if (!company) return undefined;
  // Strip suffixes
  const slug = company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|gmbh|sa|ag|plc|limited)\b\.?/g, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const enrich = formData.get("enrich") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (enrich && !process.env.PROSPEO_API_KEY) {
      return NextResponse.json(
        { error: "PROSPEO_API_KEY not configured on the server" },
        { status: 500 }
      );
    }

    const text = await file.text();

    // Parse CSV
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      console.warn("CSV parse warnings:", parsed.errors.slice(0, 3));
    }

    const rows = parsed.data;
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
    }

    const headers = parsed.meta.fields || [];

    // Detect column names
    const cols = {
      first_name: findColumn(headers, COLUMN_ALIASES.first_name),
      last_name: findColumn(headers, COLUMN_ALIASES.last_name),
      email: findColumn(headers, COLUMN_ALIASES.email),
      linkedin_url: findColumn(headers, COLUMN_ALIASES.linkedin_url),
      company_name: findColumn(headers, COLUMN_ALIASES.company_name),
      title: findColumn(headers, COLUMN_ALIASES.title),
    };

    // Extract lookup keys
    const linkedinUrls = new Set<string>();
    const emails = new Set<string>();

    for (const row of rows) {
      if (cols.linkedin_url) {
        const li = normalizeLinkedIn(row[cols.linkedin_url]);
        if (li) linkedinUrls.add(li);
      }
      if (cols.email) {
        const e = normalizeKey(row[cols.email]);
        if (e) emails.add(e);
      }
    }

    // Batch query Supabase for matches
    // We pull a wide selection so we can populate all output columns
    const SELECT = "id, email, first_name, last_name, linkedin_url, company_name, overall_status, total_emails_sent, total_replies, meeting_booked, last_contacted_at, source_platform, first_seen_at, tags";

    // 1. LinkedIn URL matches
    const linkedinMap = new Map<string, any>();
    if (linkedinUrls.size > 0) {
      const liArray = Array.from(linkedinUrls);
      // Supabase has a limit on .in() — chunk to 500 at a time
      for (let i = 0; i < liArray.length; i += 500) {
        const chunk = liArray.slice(i, i + 500);
        // Match against multiple URL formats stored in DB
        const { data } = await supabase
          .from("contacts")
          .select(SELECT)
          .or(
            chunk
              .map((u) => `linkedin_url.ilike.%${u.replace(/[%_]/g, "")}%`)
              .join(",")
          );
        if (data) {
          for (const c of data) {
            const norm = normalizeLinkedIn(c.linkedin_url);
            if (norm) linkedinMap.set(norm, c);
          }
        }
      }
    }

    // 2. Email matches
    const emailMap = new Map<string, any>();
    if (emails.size > 0) {
      const emailArray = Array.from(emails);
      for (let i = 0; i < emailArray.length; i += 500) {
        const chunk = emailArray.slice(i, i + 500);
        const { data } = await supabase
          .from("contacts")
          .select(SELECT)
          .in("email", chunk);
        if (data) {
          for (const c of data) {
            emailMap.set(normalizeKey(c.email), c);
          }
        }
      }
    }

    // 3. Build diff rows
    const diffRows: DiffRow[] = [];
    const unmatchedRows: { idx: number; first: string; last: string; company: string }[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      let match: any = null;
      let method = "no_match";

      // Try LinkedIn first
      if (cols.linkedin_url) {
        const li = normalizeLinkedIn(row[cols.linkedin_url]);
        if (li && linkedinMap.has(li)) {
          match = linkedinMap.get(li);
          method = "linkedin_url";
        }
      }

      // Try email
      if (!match && cols.email) {
        const e = normalizeKey(row[cols.email]);
        if (e && emailMap.has(e)) {
          match = emailMap.get(e);
          method = "email";
        }
      }

      // Stash for fallback name+company lookup
      if (!match && cols.first_name && cols.last_name && cols.company_name) {
        const first = normalizeKey(row[cols.first_name]);
        const last = normalizeKey(row[cols.last_name]);
        const company = normalizeKey(row[cols.company_name]);
        if (first && last && company) {
          unmatchedRows.push({ idx, first, last, company });
        }
      }

      diffRows.push(buildDiffRow(row, match, method));
    }

    // 4. Fallback: name + company fuzzy match for still-unmatched rows
    // Batch by querying all contacts with matching last names, then filter in JS
    if (unmatchedRows.length > 0) {
      const lastNames = Array.from(new Set(unmatchedRows.map((u) => u.last)));
      // Chunk last names for the in() query
      const candidateMap = new Map<string, any[]>();
      for (let i = 0; i < lastNames.length; i += 500) {
        const chunk = lastNames.slice(i, i + 500);
        const { data } = await supabase
          .from("contacts")
          .select(SELECT)
          .in("last_name", chunk);
        if (data) {
          for (const c of data) {
            const key = normalizeKey(c.last_name);
            if (!candidateMap.has(key)) candidateMap.set(key, []);
            candidateMap.get(key)!.push(c);
          }
        }
      }

      for (const u of unmatchedRows) {
        const candidates = candidateMap.get(u.last) || [];
        const match = candidates.find((c) => {
          const cFirst = normalizeKey(c.first_name);
          const cCompany = normalizeKey(c.company_name);
          return cFirst === u.first && cCompany.includes(u.company.split(" ")[0]);
        });
        if (match) {
          diffRows[u.idx] = buildDiffRow(rows[u.idx], match, "name_company");
        }
      }
    }

    // 4.5. Prospeo enrichment for still-unmatched rows
    let prospeoAttempted = 0;
    let prospeoFound = 0;
    let prospeoSaved = 0;
    let prospeoErrors = 0;

    if (enrich && process.env.PROSPEO_API_KEY) {
      const apiKey = process.env.PROSPEO_API_KEY;

      // Track context for each enrichment record so we can re-hydrate by identifier.
      const enrichContext = new Map<
        string,
        {
          idx: number;
          first: string;
          last: string;
          company: string;
          title: string;
          li: string | null;
        }
      >();

      // Build the Prospeo bulk input — one entry per "no_match" row that has
      // enough data to identify the person (LinkedIn URL OR name+company).
      const people: ProspeoPersonInput[] = [];
      for (let idx = 0; idx < diffRows.length; idx++) {
        if (diffRows[idx].in_database === "yes") continue;
        const row = rows[idx];
        const liNorm = cols.linkedin_url ? normalizeLinkedIn(row[cols.linkedin_url]) : null;
        const first = cols.first_name ? (row[cols.first_name] || "").trim() : "";
        const last = cols.last_name ? (row[cols.last_name] || "").trim() : "";
        const company = cols.company_name ? (row[cols.company_name] || "").trim() : "";
        const title = cols.title ? (row[cols.title] || "").trim() : "";
        const existingEmail = cols.email ? (row[cols.email] || "").trim() : "";

        // Skip rows where Apollo already revealed an email — don't waste credits.
        if (existingEmail && existingEmail.includes("@")) {
          diffRows[idx].prospeo_email = existingEmail;
          diffRows[idx].prospeo_email_status = "from_csv";
          diffRows[idx].prospeo_method = "apollo_csv";
          continue;
        }

        // Prospeo requires at minimum: (first+last OR full_name) + one company
        // identifier (name / website / linkedin). LinkedIn URL alone also works.
        const hasLi = !!liNorm;
        const hasNameCompany = first && last && company;
        if (!hasLi && !hasNameCompany) continue;

        const id = `row_${idx}`;
        const fullLi = liNorm ? (liNorm.startsWith("http") ? liNorm : `https://${liNorm}`) : undefined;
        const domain = extractDomain(company);

        people.push({
          identifier: id,
          first_name: first || undefined,
          last_name: last || undefined,
          linkedin_url: fullLi,
          company_name: company || undefined,
          company_website: domain,
        });
        enrichContext.set(id, {
          idx,
          first,
          last,
          company,
          title,
          li: fullLi || null,
        });
      }

      prospeoAttempted = people.length;

      // Fire off bulk calls — 50 records each, up to 3 batches in flight at
      // once (well under Prospeo's 150 req/min cap).
      const enrichmentResults: ProspeoEnrichedPerson[] =
        people.length > 0 ? await bulkEnrichAll(people, apiKey, 3) : [];

      // Apply results to diffRows and stage upserts.
      const contactsToInsert: any[] = [];
      for (const r of enrichmentResults) {
        const ctx = enrichContext.get(r.identifier);
        if (!ctx) continue;
        const dr = diffRows[ctx.idx];

        if (r.error) {
          prospeoErrors++;
          dr.prospeo_error = r.error;
          dr.prospeo_method = "bulk";
          continue;
        }

        if (r.email) {
          prospeoFound++;
          dr.prospeo_email = r.email;
          dr.prospeo_email_status = r.email_status || "unknown";
          dr.prospeo_method = "bulk";

          contactsToInsert.push({
            email: r.email.toLowerCase().trim(),
            first_name: r.first_name || ctx.first || null,
            last_name: r.last_name || ctx.last || null,
            title: r.title || ctx.title || null,
            company_name: r.company_name || ctx.company || null,
            company_domain:
              r.company_domain || extractDomain(ctx.company, r.email) || null,
            linkedin_url: r.linkedin_url || ctx.li || null,
            source_platform: "apollo",
            source_list: "apollo_csv_diff",
            tags: ["prospeo_enriched"],
            overall_status: "new",
            first_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } else {
          dr.prospeo_email_status = "not_found";
          dr.prospeo_method = "bulk";
        }
      }

      // Bulk upsert into Supabase (chunked)
      if (contactsToInsert.length > 0) {
        for (let i = 0; i < contactsToInsert.length; i += 500) {
          const chunk = contactsToInsert.slice(i, i + 500);
          const { error: upsertErr, count } = await supabase
            .from("contacts")
            .upsert(chunk, { onConflict: "email", ignoreDuplicates: false, count: "exact" });
          if (upsertErr) {
            console.error("Supabase upsert error:", upsertErr);
          } else {
            prospeoSaved += count ?? chunk.length;
          }
        }
      }
    }

    // 5. Build XLSX output
    const outputRows = diffRows.map((d) => ({
      ...d.original,
      in_database: d.in_database,
      match_method: d.match_method,
      db_id: d.db_id,
      db_status: d.db_status,
      db_first_seen: d.db_first_seen,
      db_last_contacted: d.db_last_contacted,
      db_emails_sent: d.db_emails_sent,
      db_replies: d.db_replies,
      db_meeting_booked: d.db_meeting_booked,
      db_source: d.db_source,
      db_tags: d.db_tags,
      prospeo_email: d.prospeo_email,
      prospeo_email_status: d.prospeo_email_status,
      prospeo_method: d.prospeo_method,
      prospeo_error: d.prospeo_error,
    }));

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(outputRows);

    // Add summary sheet
    const matched = diffRows.filter((r) => r.in_database === "yes").length;
    const summary: (string | number)[][] = [
      ["Apollo CSV Diff Report"],
      ["Generated", new Date().toISOString()],
      [],
      ["Total rows in CSV", rows.length],
      ["Already in database", matched],
      ["New (not in database)", rows.length - matched],
      [
        "% already known",
        rows.length > 0 ? `${((matched / rows.length) * 100).toFixed(1)}%` : "0%",
      ],
      [],
      ["Match method breakdown"],
      ["LinkedIn URL", diffRows.filter((r) => r.match_method === "linkedin_url").length],
      ["Email", diffRows.filter((r) => r.match_method === "email").length],
      ["Name + Company", diffRows.filter((r) => r.match_method === "name_company").length],
      ["No match (NEW)", diffRows.filter((r) => r.match_method === "no_match").length],
    ];

    if (enrich) {
      summary.push(
        [],
        ["Prospeo enrichment"],
        ["Attempted", prospeoAttempted],
        ["Emails found", prospeoFound],
        ["Saved to Supabase (cached for next time)", prospeoSaved],
        ["Errors", prospeoErrors],
        [
          "Hit rate",
          prospeoAttempted > 0
            ? `${((prospeoFound / prospeoAttempted) * 100).toFixed(1)}%`
            : "0%",
        ]
      );
    }

    summary.push(
      [],
      ["Tip"],
      ["Sort the Contacts sheet by 'in_database' = 'no' to see contacts you have NOT enriched yet."],
      enrich
        ? ["The 'prospeo_email' column has the freshly-enriched email — copy these into your sequencer."]
        : ["Only reveal Apollo emails for those rows to avoid burning credits."]
    );
    const summarySheet = XLSX.utils.aoa_to_sheet(summary);

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(workbook, sheet, "Contacts");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="apollo-diff-${Date.now()}.xlsx"`,
        "X-Total-Rows": String(rows.length),
        "X-Matched-Rows": String(matched),
        "X-New-Rows": String(rows.length - matched),
        "X-Prospeo-Attempted": String(prospeoAttempted),
        "X-Prospeo-Found": String(prospeoFound),
        "X-Prospeo-Saved": String(prospeoSaved),
        "X-Prospeo-Errors": String(prospeoErrors),
      },
    });
  } catch (err: any) {
    console.error("Diff error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Legacy HeyReach ingest used to create placeholder emails like
 * `joe_linkedin_com@linkedin.placeholder` to satisfy a NOT NULL constraint.
 * After migration 003 the column is nullable, but existing rows may still
 * carry these fakes. Hide them so they never surface in the Apollo diff.
 */
function realEmailOrEmpty(email: unknown): string {
  if (typeof email !== "string" || !email) return "";
  if (email.endsWith("@linkedin.placeholder")) return "";
  if (email.endsWith("@placeholder.local")) return "";
  return email;
}

function buildDiffRow(
  original: Record<string, unknown>,
  match: any,
  method: string
): DiffRow {
  const base = {
    prospeo_email: "",
    prospeo_email_status: "",
    prospeo_method: "",
    prospeo_error: "",
  };
  if (!match) {
    return {
      original,
      in_database: "no",
      match_method: "no_match",
      db_id: "",
      db_status: "",
      db_first_seen: "",
      db_last_contacted: "",
      db_emails_sent: "",
      db_replies: "",
      db_meeting_booked: "",
      db_source: "",
      db_tags: "",
      ...base,
    };
  }
  return {
    original,
    in_database: "yes",
    match_method: method,
    db_id: match.id || "",
    db_status: match.overall_status || "",
    db_first_seen: match.first_seen_at || "",
    db_last_contacted: match.last_contacted_at || "",
    db_emails_sent: match.total_emails_sent ?? 0,
    db_replies: match.total_replies ?? 0,
    db_meeting_booked: match.meeting_booked ? "yes" : "no",
    db_source: match.source_platform || "",
    db_tags: Array.isArray(match.tags) ? match.tags.join("; ") : "",
    // If we already have a real email in the cached record, surface it here
    // too. Filter out legacy placeholders from the old HeyReach flow so we
    // don't leak `*@linkedin.placeholder` rows into the XLSX.
    prospeo_email: realEmailOrEmpty(match.email),
    prospeo_email_status: realEmailOrEmpty(match.email) ? "cached" : "",
    prospeo_method: realEmailOrEmpty(match.email) ? "from_cache" : "",
    prospeo_error: "",
  };
}
