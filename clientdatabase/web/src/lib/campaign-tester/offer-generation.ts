/**
 * Module 4 — offer generation & iterative refinement.
 *
 * Two distinct Claude calls live here:
 *
 *   1. `buildInitialOfferPrompt` — "generate 10 offers" cold start, grounded
 *      strictly in the Campaign Brief. Used the first time the user lands
 *      on the offers page or clicks "regenerate from scratch".
 *
 *   2. `buildRefinementPrompt` — chat-style follow-up. The user says
 *      "ditch #3", "make #7 lean harder on the hiring signal", "give me 2
 *      more with a pay-per-meeting angle" — we send Claude the full current
 *      pool + full message history, and ask for an UPDATED pool + a short
 *      natural-language reply for the chat.
 *
 * Both return STRICT JSON so the API route can parse them deterministically.
 */

import type {
  ApolloFilters,
  IcpRefinement,
  Offer,
  OfferConversationMessage,
} from "./brief-types";

export interface OfferBriefContext {
  client_name?: string | null;
  what_they_do?: string | null;
  measurable_outcome?: string | null;
  timeline_claim?: string | null;
  named_results?: string | null;
  risk_tolerance?: string | null;
  core_pain?: string | null;
  offer_description?: string | null;

  icp_job_title?: string | null;
  icp_company_size?: string | null;
  icp_geography?: string | null;
  target_industry?: string | null;

  available_assets?: Record<string, boolean> | null;
  available_plays?: string[] | null;
  signals_selected?: string[] | null;
  icp_refinement?: IcpRefinement | null;
  apollo_filters?: ApolloFilters | null;
}

// -----------------------------------------------------------------------------
// Shared rendering
// -----------------------------------------------------------------------------

function renderBriefContext(brief: OfferBriefContext): string {
  const lines: string[] = ["CAMPAIGN BRIEF"];
  if (brief.client_name) lines.push(`  Client: ${brief.client_name}`);
  if (brief.what_they_do) lines.push(`  What they do: ${brief.what_they_do}`);
  if (brief.measurable_outcome)
    lines.push(`  Measurable outcome: ${brief.measurable_outcome}`);
  if (brief.timeline_claim) lines.push(`  Timeline claim: ${brief.timeline_claim}`);
  if (brief.named_results) lines.push(`  Named results / case studies: ${brief.named_results}`);
  if (brief.risk_tolerance) lines.push(`  Risk tolerance: ${brief.risk_tolerance}`);
  if (brief.core_pain) lines.push(`  Core pain solved: ${brief.core_pain}`);
  if (brief.offer_description) lines.push(`  Operator offer hint: ${brief.offer_description}`);

  if (brief.target_industry) lines.push(`  Target industry: ${brief.target_industry}`);
  if (brief.icp_job_title) lines.push(`  ICP title: ${brief.icp_job_title}`);
  if (brief.icp_company_size) lines.push(`  ICP company size: ${brief.icp_company_size}`);
  if (brief.icp_geography) lines.push(`  ICP geography: ${brief.icp_geography}`);

  if (brief.icp_refinement) {
    const ref = brief.icp_refinement;
    if (ref.targeting_role) lines.push(`  Targeting: ${ref.targeting_role}`);
    if (ref.primary_titles?.length)
      lines.push(`  Primary titles: ${ref.primary_titles.join(", ")}`);
    if (ref.secondary_titles?.length)
      lines.push(`  Secondary titles: ${ref.secondary_titles.join(", ")}`);
    if (ref.exclusions?.length) lines.push(`  Exclusions: ${ref.exclusions.join(", ")}`);
    if (ref.bad_fit_profile) lines.push(`  Bad-fit profile: ${ref.bad_fit_profile}`);
  }

  if (brief.available_assets) {
    const yes = Object.entries(brief.available_assets)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (yes.length) lines.push(`  Available assets: ${yes.join(", ")}`);
  }
  if (brief.available_plays?.length)
    lines.push(`  Available plays: ${brief.available_plays.join(", ")}`);
  if (brief.signals_selected?.length)
    lines.push(`  Buying signals available: ${brief.signals_selected.join(", ")}`);

  return lines.join("\n");
}

function renderOfferPool(pool: Offer[]): string {
  if (!pool.length) return "CURRENT OFFER POOL: (empty)";
  const lines = ["CURRENT OFFER POOL:"];
  for (const o of pool) {
    const flag = o.approved ? "[APPROVED] " : "";
    lines.push(
      `  #${o.rank} ${flag}${o.name} (id=${o.id})\n      one-liner: ${o.one_liner}\n      cta: ${o.cta}`,
    );
  }
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Initial 10-offer generation
// -----------------------------------------------------------------------------

/**
 * System prompt (from the SalesGlider spec, verbatim intent preserved).
 */
export const INITIAL_OFFER_SYSTEM_PROMPT = `You are an expert B2B cold email offer strategist. Based on the campaign brief below, generate exactly 10 distinct offer ideas for why a cold prospect should reply to this email.

An offer is not a service description — it is a specific, low-friction, high-value reason to start a conversation. Think: free Braves tickets, a free 30-day trial, a custom AI tool built for them, a Loom audit of their specific setup, a proprietary lead list, a case study that maps directly to their situation, a pay-per-result model.

Rank the 10 ideas from most likely to convert to least likely based on the ICP. For each offer include: the offer name, the one-liner for the email body, the matching CTA, and a short rationale.

STRICT RULES:
- Only use information from the campaign brief provided. Do not invent results or case studies that are not listed.
- Offer names are 2-5 words, concrete, operator-voice.
- One-liners are one sentence, plain text, 15-30 words.
- CTAs are a short reply-inviting sentence (6-14 words). Avoid "quick call Thursday?" — prefer reply-bait or asset-based CTAs unless the offer is a pay-per-result, in which case a direct ask works.
- Diversify across offer archetypes (audit, data asset, performance play, strategy session, shock & awe, custom AI tool, proprietary list, risk reversal, case study match, done-for-you).
- Output VALID JSON ONLY. No prose preface, no markdown fences.

OUTPUT SCHEMA:
{
  "offers": [
    { "rank": 1, "name": string, "one_liner": string, "cta": string, "rationale": string },
    ... exactly 10 items, ranks 1-10 ...
  ]
}`;

export function buildInitialOfferPrompt(brief: OfferBriefContext): string {
  return (
    renderBriefContext(brief) +
    "\n\nTASK: Generate exactly 10 ranked offer ideas for this brief. Rank 1 = most likely to convert for this ICP, rank 10 = least likely."
  );
}

// -----------------------------------------------------------------------------
// Chat refinement
// -----------------------------------------------------------------------------

export const REFINEMENT_SYSTEM_PROMPT = `You are the copy-and-strategy partner inside SalesGlider's Cold Email Campaign Testing Machine. The operator is iterating on a pool of 10 B2B cold email offer ideas for a specific campaign.

Your job is to:
1. Read the campaign brief, the current offer pool (with approval flags), and the full chat history.
2. Apply the operator's latest instruction PRECISELY — add, remove, swap, tighten, reframe, or reorder offers as asked.
3. NEVER invent results, case studies, or claims outside the brief.
4. Preserve the IDs of offers that are already in the pool unless you are deleting them. When you add a new offer, mint a new UUID-like id (hyphenated lowercase, 8+ chars).
5. Preserve \`approved: true\` on any offer the user has already approved, unless they explicitly ask you to drop it.
6. Keep the pool size at 10 unless the operator explicitly asks for more/fewer. Re-rank (1-N) from most likely to convert for this ICP.
7. Keep the chat reply short — 1-3 sentences — summarizing exactly what changed and why.
8. Output VALID JSON ONLY. No prose preface, no markdown fences.

OUTPUT SCHEMA:
{
  "assistant_message": string,   // short reply for the chat log (what you changed)
  "offers": [
    { "id": string, "rank": int, "name": string, "one_liner": string, "cta": string, "rationale": string, "approved": bool },
    ...
  ]
}`;

export function buildRefinementPrompt(params: {
  brief: OfferBriefContext;
  currentPool: Offer[];
  history: OfferConversationMessage[];
  latestUserMessage: string;
}): string {
  const { brief, currentPool, history, latestUserMessage } = params;
  const parts = [
    renderBriefContext(brief),
    "",
    renderOfferPool(currentPool),
    "",
    "CHAT HISTORY (oldest → newest):",
    ...history
      .filter((m) => m.role !== "system")
      .map(
        (m, i) => `  [${i}] ${m.role.toUpperCase()}: ${truncate(m.content, 600)}`,
      ),
    "",
    `LATEST USER INSTRUCTION: ${latestUserMessage}`,
    "",
    "TASK: Return the UPDATED offer pool that incorporates the latest instruction, plus a short assistant_message summarizing what changed.",
  ];
  return parts.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// -----------------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------------

export interface InitialOfferResponse {
  offers: Array<Omit<Offer, "id" | "approved" | "generated_at">>;
}

export interface RefinementResponse {
  assistant_message: string;
  offers: Offer[];
}

/**
 * Generate a cheap, readable offer id. Good enough for the pool; not globally
 * unique but safe inside a single brief.
 */
export function mintOfferId(seed: string): string {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `offer-${suffix}`;
}

/**
 * Normalize the freshly-parsed `InitialOfferResponse` into the canonical
 * `Offer` shape: mint ids, stamp generated_at, default approved=false.
 */
export function hydrateInitialOffers(raw: InitialOfferResponse): Offer[] {
  const now = new Date().toISOString();
  return raw.offers.slice(0, 10).map((o, i) => ({
    id: mintOfferId(o.name),
    rank: typeof o.rank === "number" ? o.rank : i + 1,
    name: String(o.name ?? "").trim(),
    one_liner: String(o.one_liner ?? "").trim(),
    cta: String(o.cta ?? "").trim(),
    rationale: o.rationale ? String(o.rationale).trim() : undefined,
    approved: false,
    generated_at: now,
  }));
}

/**
 * Normalize a refinement response. Preserves approval flags from the previous
 * pool when Claude returns an offer with the same id.
 */
export function hydrateRefinedOffers(
  raw: RefinementResponse,
  previousPool: Offer[],
): Offer[] {
  const now = new Date().toISOString();
  const prevById = new Map(previousPool.map((o) => [o.id, o]));
  return raw.offers.map((o, i) => {
    const prev = prevById.get(o.id);
    const approved =
      typeof o.approved === "boolean"
        ? o.approved
        : prev?.approved ?? false;
    return {
      id: o.id || mintOfferId(o.name ?? `offer-${i}`),
      rank: typeof o.rank === "number" ? o.rank : i + 1,
      name: String(o.name ?? "").trim(),
      one_liner: String(o.one_liner ?? "").trim(),
      cta: String(o.cta ?? "").trim(),
      rationale: o.rationale ? String(o.rationale).trim() : prev?.rationale,
      approved,
      generated_at: prev?.generated_at ?? now,
    };
  });
}
