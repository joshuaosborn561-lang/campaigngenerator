import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { assertReadOnlySelect } from "./sql-guard";

const SCHEMA_DOC = `You are helping answer questions about an agency's cold outbound data in PostgreSQL (public schema).

Tables:
- clients: id, name, industry_vertical, notes, smartlead_api_key_enc, heyreach_api_key_enc (encrypted; do not SELECT raw bytes), sync_enabled, created_at, updated_at — decrypted keys are only available inside DB functions, not for ad-hoc queries
- campaigns: id, client_id, source_platform (smartlead|heyreach), smartlead_campaign_id, heyreach_campaign_id, name, status, campaign_start_date, target_title, target_company_size, target_industry, target_geography, offer_type (legacy classifier), copy_patterns[], lead_source, play_used, offer_framing, cta_type, sequence_length, icp_job_title, icp_company_size, icp_geography, send_volume, open_rate, reply_rate, bounce_rate, positive_reply_count, negative_reply_count, referral_count, ooo_count, not_interested_count, meetings_booked, meetings_per_500 (generated), list_source, gemini_offer_profile (jsonb — incentive, case studies, CTA, length band), inferred_icp (jsonb — title_patterns, departments, geography, industry, company_size_range from lead samples), inferred_at, sequence_fingerprint, created_at, updated_at
- sequence_steps: id, campaign_id, step_number, variant_label, subject_line, email_body, delay_days, open_rate, reply_rate, click_rate, offer_type, copy_patterns[], inferred_offer_angle (jsonb — hook, incentive, assets), inferred_at, content_fingerprint, created_at
- leads: id, campaign_id, smartlead_lead_id, email, first_name, last_name, company, title, industry, company_size, company_revenue, seniority, department, city, state, country, status, category, reply_sentiment, meeting_booked, created_at, updated_at
- contacts: unified Apollo-style people (email, title, seniority, department, company_*, city, state, country, …)
- contact_campaigns: contact_id, campaign_id, lead_id, status
- email_events, sync_log, campaign_briefs, test_runs, calendly_events (meetings), offer_conversations

Useful views: campaign_performance, subject_line_performance, contact_search`;

const MODEL = process.env.AGENCY_QUERY_MODEL ?? "claude-sonnet-4-5";

export async function runAgencyQuery(question: string): Promise<{
  answer: string;
  query: string;
  explanation: string;
  results: unknown[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey });

  const step1 = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${SCHEMA_DOC}

User question: ${question}

Write a single read-only SQL query (PostgreSQL) that best answers the question. Use only SELECT or WITH … SELECT. No semicolons. Prefer joining clients, campaigns, sequence_steps, leads, and contacts as needed.

Respond with JSON only, no markdown:
{"query":"...","explanation":"one sentence"}`,
      },
    ],
  });

  const text1 = step1.content[0].type === "text" ? step1.content[0].text : "";
  const jsonMatch = text1.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return JSON for the query step");
  const parsed = JSON.parse(jsonMatch[0]) as { query?: string; explanation?: string };
  const rawQuery = parsed.query?.trim();
  const explanation = parsed.explanation?.trim() ?? "";
  if (!rawQuery) throw new Error("Missing query in Claude response");

  const query = assertReadOnlySelect(rawQuery);

  const { data: rpcData, error: rpcErr } = await supabase.rpc("exec_readonly", {
    sql_text: query,
  });

  if (rpcErr) {
    throw new Error(`Query failed: ${rpcErr.message}`);
  }

  let rpcParsed: unknown = rpcData;
  if (typeof rpcParsed === "string") {
    try {
      rpcParsed = JSON.parse(rpcParsed);
    } catch {
      rpcParsed = [];
    }
  }
  const results = Array.isArray(rpcParsed)
    ? rpcParsed
    : rpcParsed != null
      ? [rpcParsed]
      : [];

  const step2 = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `User question: ${question}

SQL used:
${query}

Results (JSON array of rows):
${JSON.stringify(results).slice(0, 120000)}

Answer the user's question in plain English. Cite specific numbers from the results when present. If the result set is empty, say so clearly.`,
      },
    ],
  });

  const answer =
    step2.content[0].type === "text" ? step2.content[0].text : "No answer generated.";

  return { answer, query, explanation, results };
}
