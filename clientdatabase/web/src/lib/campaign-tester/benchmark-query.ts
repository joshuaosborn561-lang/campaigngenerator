/**
 * Pulls historical campaign performance from Supabase to serve as benchmarks
 * in the Campaign Testing Machine.
 *
 * Benchmark match axes (any combination): target_industry, icp_company_size,
 * offer_type, play_used, lead_source. Returns tiered lists so the UI can show
 * "exact match" vs "industry match only" vs "org-wide baseline".
 */

import { supabase } from "../supabase";

export interface BenchmarkCampaign {
  id: string;
  name: string;
  target_industry: string | null;
  icp_company_size: string | null;
  offer_type: string | null;
  play_used: string | null;
  lead_source: string | null;
  send_volume: number | null;
  open_rate: number | null;
  reply_rate: number | null;
  positive_reply_count: number | null;
  meetings_booked: number | null;
  meetings_per_500: number | null;
  winner: boolean | null;
  campaign_start_date: string | null;
}

export interface BenchmarkQuery {
  target_industry?: string | null;
  icp_company_size?: string | null;
  offer_type?: string | null;
  play_used?: string | null;
  lead_source?: string | null;
}

export interface BenchmarkResult {
  exact: BenchmarkCampaign[];
  partial: BenchmarkCampaign[];
  org_baseline: BenchmarkCampaign[];
  summary: {
    exact_count: number;
    partial_count: number;
    baseline_count: number;
    avg_positive_reply_rate: number | null;
    avg_meetings_per_500: number | null;
    best_meetings_per_500: number | null;
  };
}

const SELECT_COLS = [
  "id",
  "name",
  "target_industry",
  "icp_company_size",
  "offer_type",
  "play_used",
  "lead_source",
  "send_volume",
  "open_rate",
  "reply_rate",
  "positive_reply_count",
  "meetings_booked",
  "meetings_per_500",
  "winner",
  "campaign_start_date",
].join(",");

async function fetchWithFilters(filters: BenchmarkQuery, limit: number) {
  let q = supabase
    .from("campaigns")
    .select(SELECT_COLS)
    .gt("send_volume", 0)
    .order("meetings_per_500", { ascending: false, nullsFirst: false })
    .limit(limit);

  for (const [col, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && val !== "") {
      q = q.eq(col, val);
    }
  }

  const { data, error } = await q;
  if (error) throw new Error(`Benchmark query failed: ${error.message}`);
  return (data ?? []) as unknown as BenchmarkCampaign[];
}

function averagePositiveReplyRate(rows: BenchmarkCampaign[]): number | null {
  const vals = rows
    .map((r) => {
      if (!r.send_volume || r.send_volume === 0) return null;
      if (r.positive_reply_count == null) return null;
      return r.positive_reply_count / r.send_volume;
    })
    .filter((v): v is number => v !== null && isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function averageMeetingsPer500(rows: BenchmarkCampaign[]): number | null {
  const vals = rows
    .map((r) => r.meetings_per_500)
    .filter((v): v is number => v !== null && v !== undefined && isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function bestMeetingsPer500(rows: BenchmarkCampaign[]): number | null {
  const vals = rows
    .map((r) => r.meetings_per_500)
    .filter((v): v is number => v !== null && v !== undefined && isFinite(v));
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

/**
 * Three-tier benchmark lookup:
 *   - exact: all provided filters match
 *   - partial: only target_industry + icp_company_size match (fills in if exact
 *              returns fewer than 3 rows)
 *   - org_baseline: top org-wide campaigns by meetings_per_500 (always returned
 *                   for context)
 */
export async function loadBenchmarks(query: BenchmarkQuery): Promise<BenchmarkResult> {
  const exact = await fetchWithFilters(query, 25);

  // Partial tier: industry + size only.
  let partial: BenchmarkCampaign[] = [];
  if (exact.length < 3) {
    const partialQuery: BenchmarkQuery = {
      target_industry: query.target_industry ?? null,
      icp_company_size: query.icp_company_size ?? null,
    };
    const rows = await fetchWithFilters(partialQuery, 25);
    // Filter out ones already in exact.
    const exactIds = new Set(exact.map((r) => r.id));
    partial = rows.filter((r) => !exactIds.has(r.id));
  }

  // Org baseline: top 10 campaigns overall with send_volume > 0.
  const baseline = await fetchWithFilters({}, 10);

  const combined = [...exact, ...partial];
  const bestRows = combined.length > 0 ? combined : baseline;

  return {
    exact,
    partial,
    org_baseline: baseline,
    summary: {
      exact_count: exact.length,
      partial_count: partial.length,
      baseline_count: baseline.length,
      avg_positive_reply_rate: averagePositiveReplyRate(bestRows),
      avg_meetings_per_500: averageMeetingsPer500(bestRows),
      best_meetings_per_500: bestMeetingsPer500(bestRows),
    },
  };
}
