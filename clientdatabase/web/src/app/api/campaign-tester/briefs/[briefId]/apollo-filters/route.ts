import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";
import { getSignal, SIGNALS } from "@/lib/campaign-tester/signals";
import type { ApolloFilters, BriefRecord, IcpRefinement } from "@/lib/campaign-tester/brief-types";
import {
  MODULE_1_BRIEF_CHECKLIST,
  MODULE_3_ICP_CHECKLIST,
} from "@/lib/campaign-tester/module-checklists";

interface RouteContext {
  params: Promise<{ briefId: string }>;
}

const SYSTEM_PROMPT = `You are a B2B list-building operator for SalesGlider's Cold Email Campaign Testing Machine.

Given the campaign brief + refined ICP + selected buying signals, produce an Apollo / AI-Ark filter specification and per-signal sourcing instructions.

TARGETING PHILOSOPHY — READ THIS CAREFULLY:
Apollo's industry taxonomy is crude and unreliable ("Information Technology", "Computer Software", "Marketing and Advertising" — these buckets are too wide to target sharply). DO NOT rely on industries as the primary targeting axis. Instead, drive targeting with INDUSTRY-SPECIFIC KEYWORDS: terms, acronyms, tools, certifications, job-description language, and product categories that ONLY people inside this industry use. That is the sharpest filter Apollo / AI-Ark has.

KEYWORD RULES (this is the most important part of your output):
- Generate 8-20 keywords. Each must be a phrase a non-industry person would not recognize or use casually.
- Favor: industry acronyms, regulation names, tool categories, certification names, deliverable types, billing model names, workflow jargon, customer-type shorthand.
- Avoid: generic business words ("sales", "growth", "operations"), the literal industry name, company-stage words ("startup", "enterprise").
- Mix keyword types across: (a) role/title keywords, (b) company-description keywords, (c) tools/stack keywords, (d) certification/compliance keywords.
- Where Apollo's keyword field is used, assume it scans job titles + company descriptions + tech stacks combined.

INDUSTRY KEYWORD EXAMPLES (for illustration only — generate keywords appropriate to the brief's actual industry):
- MSPs: "managed services provider", "MSP", "RMM", "PSA", "SOC 2", "NOC", "endpoint management", "co-managed IT", "quarterly business review", "ticket volume", "MSP peer group"
- Cybersecurity: "SIEM", "threat hunting", "zero trust", "EDR", "XDR", "MDR", "penetration testing", "SOC analyst", "incident response", "CISA", "NIST 800-53"
- Home services: "home services", "HVAC", "plumbing", "electrical contractor", "ServiceTitan", "Housecall Pro", "after-hours calls", "dispatch", "franchisees", "rooftop count", "truck-to-tech ratio"
- Staffing: "W2", "1099", "bench strength", "placement fee", "MSP VMS", "Bullhorn", "recruiter productivity", "direct hire", "contract placement", "req to fill ratio"
- SaaS: the category name, not "SaaS" itself (e.g. "product-led growth", "PLG motion", "usage-based pricing", "developer tools", "horizontal B2B SaaS", "vertical SaaS")

OTHER FIELD RULES:
- job_titles: 3-8 operator-ready Apollo titles. Ranked 1-3 should be the sharpest. Include variations ("VP of Sales", "SVP Sales", "Head of Sales").
- industries: AT MOST 3 entries, and ONLY if the Apollo taxonomy genuinely maps. If it doesn't, return an empty array and rely on keywords. Never duplicate industry-as-keyword.
- employee_count: a single string range Apollo accepts ("11-50", "51-200", "50-500").
- geography: 1-5 locations. Country/region level unless brief explicitly scopes smaller.
- exclude: negative keywords (industries/titles/terms you explicitly want filtered OUT).
- signals_to_layer: the signal ids the operator already selected, listed so Apollo / AI-Ark can stack them.
- sourcing_instructions: one entry per signal id in the provided list. Keys are signal ids verbatim; values are 1-3 sentence instructions covering tool, filter, and output format.
- tam_estimate: short range string like "8,000–12,000 contacts in Apollo" — OK to say "unknown, test with a 500-row pull" if genuinely unclear.

STRICT RULES:
- Only use information from the brief + refined ICP + selected signals. Do not invent claims.
- Output VALID JSON ONLY. No prose preface, no markdown fences.

OUTPUT SCHEMA:
{
  "job_titles": string[],
  "industries": string[],
  "employee_count": string,
  "geography": string[],
  "keywords": string[],
  "exclude": string[],
  "signals_to_layer": string[],
  "sourcing_instructions": { [signal_id: string]: string },
  "tam_estimate": string
}`;

const APOLLO_SYSTEM_WITH_CHECKLISTS = [
  SYSTEM_PROMPT,
  "",
  "--- EXPERT STAGE CHECKLISTS (Module 1 brief + Module 3 ICP — apply when estimating TAM, signals, and filters) ---",
  MODULE_1_BRIEF_CHECKLIST,
  "",
  MODULE_3_ICP_CHECKLIST,
  "--- END EXPERT CHECKLISTS ---",
].join("\n");

function renderIcpBlock(brief: BriefRecord): string {
  const ref: IcpRefinement = brief.icp_refinement ?? {};
  const lines: string[] = ["CAMPAIGN BRIEF"];
  lines.push(`  Client: ${brief.clients?.name ?? "—"}`);
  if (brief.what_they_do) lines.push(`  What they do: ${brief.what_they_do}`);
  if (brief.core_pain) lines.push(`  Core pain: ${brief.core_pain}`);
  if (brief.target_industry) lines.push(`  Target industry: ${brief.target_industry}`);
  if (brief.icp_job_title) lines.push(`  Headline ICP title: ${brief.icp_job_title}`);
  if (brief.icp_company_size) lines.push(`  Headline ICP size: ${brief.icp_company_size}`);
  if (brief.icp_geography) lines.push(`  Headline ICP geography: ${brief.icp_geography}`);

  lines.push("");
  lines.push("REFINED ICP");
  if (ref.targeting_role) lines.push(`  Targeting: ${ref.targeting_role}`);
  if (ref.icp_definition_by?.length)
    lines.push(`  Defined by: ${ref.icp_definition_by.join(", ")}`);
  if (ref.primary_titles?.length)
    lines.push(`  Primary titles: ${ref.primary_titles.join(", ")}`);
  if (ref.secondary_titles?.length)
    lines.push(`  Secondary titles: ${ref.secondary_titles.join(", ")}`);
  if (ref.bad_fit_profile) lines.push(`  Bad-fit profile: ${ref.bad_fit_profile}`);
  if (ref.min_company_size != null)
    lines.push(`  Min company size: ${ref.min_company_size} employees`);
  if (ref.exclusions?.length) lines.push(`  Exclusions: ${ref.exclusions.join(", ")}`);

  const signals = (brief.signals_selected ?? []).filter(
    (id) => !!getSignal(id),
  );
  lines.push("");
  lines.push("BUYING SIGNALS SELECTED");
  if (!signals.length) {
    lines.push("  (none — cold database pull)");
  } else {
    for (const id of signals) {
      const s = getSignal(id)!;
      lines.push(`  - ${id} (${s.label}): ${s.description}`);
    }
  }

  return lines.join("\n");
}

/**
 * POST /api/campaign-tester/briefs/:briefId/apollo-filters
 *
 * Uses the brief's ICP refinement + selected signals to produce an
 * Apollo / AI-Ark filter spec via Claude. Persists the result on
 * campaign_briefs.apollo_filters and returns it.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;

    const { data: briefRow, error: briefErr } = await supabase
      .from("campaign_briefs")
      .select("*, clients (id, name, industry_vertical)")
      .eq("id", briefId)
      .maybeSingle();
    if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });
    if (!briefRow) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const brief = briefRow as unknown as BriefRecord;

    const selectedIds = (brief.signals_selected ?? []).filter((id) => !!getSignal(id));
    const signalList = selectedIds
      .map((id) => getSignal(id)!)
      .concat(selectedIds.length === 0 ? SIGNALS.filter((s) => s.id === "no_signal") : []);

    const user = [
      renderIcpBlock(brief),
      "",
      `AVAILABLE SIGNAL IDS (must appear as keys in sourcing_instructions): ${signalList.map((s) => s.id).join(", ")}`,
      "",
      "TASK: Produce the Apollo / AI-Ark filter JSON.",
    ].join("\n");

    const raw = await callClaude({
      system: APOLLO_SYSTEM_WITH_CHECKLISTS,
      user,
      maxTokens: 1500,
      grounding: {
        clientId: brief.client_id ?? null,
        industryVertical: brief.target_industry ?? brief.clients?.industry_vertical ?? null,
      },
    });
    const parsed = parseJsonFromClaude<ApolloFilters>(raw);

    const { data, error } = await supabase
      .from("campaign_briefs")
      .update({ apollo_filters: parsed })
      .eq("id", briefId)
      .select("apollo_filters")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      apollo_filters: data.apollo_filters,
      debug:
        process.env.NODE_ENV === "development"
          ? { system: APOLLO_SYSTEM_WITH_CHECKLISTS, user, raw }
          : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("[apollo-filters] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
