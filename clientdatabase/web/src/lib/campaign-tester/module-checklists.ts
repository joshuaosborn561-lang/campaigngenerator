/**
 * Expert checklists injected into Claude system prompts per campaign wizard stage.
 *
 * Where they apply in code:
 * - Module 1–2 + 3 + 4: offer pool (POST /offers, offers/chat) — INITIAL + REFINEMENT prompts
 * - Module 1 + 3: lead filters (POST /apollo-filters)
 * - Module 1–5: Tests 2–6 copy (POST /generate) via buildGenerationSystemPrompt()
 *
 * Setup pages brief / infra / icp / offers are mostly form UI; Claude sees these
 * checklists when those stages trigger generation (offers, filters, tests).
 */

/** Stage 1 — module_1_brief: foundation before offers and copy */
export const MODULE_1_BRIEF_CHECKLIST = `
STAGE 1 CHECKLIST — BRIEF / FOUNDATION (apply when interpreting the campaign and any copy):
- Dream outcome: Name the specific result the prospect wants, not a list of service features.
- Founder voice: Natural, direct language — avoid generic marketing-speak.
- Unique mechanism: Name the proprietary process, tool, or method that delivers the outcome.
- Pain & risk: Surface ICP frustrations this offer removes; tie proof to those pains.
- 10-minute research rule: Ask what a human would learn in ~10 minutes on this prospect/company and let that sharpen specificity.
`.trim();

/** Stage 2 — module_2_infra: delivery / sending constraints */
export const MODULE_2_INFRA_CHECKLIST = `
STAGE 2 CHECKLIST — INFRASTRUCTURE / DELIVERY (do not promise sends that break these rules):
- Protect the primary domain: cold outreach uses satellite domains, not the main brand domain.
- Redundancy: Prefer multiple domain/inbox sets so volume can shift if one set is throttled.
- Volume: Treat per-inbox daily caps as strict (align with the brief’s infra snapshot — often ≤30–50 sends/day per inbox unless the brief states otherwise).
- Warm-up: New inboxes need a real warm-up window before full volume (often 2+ weeks).
- Authentication: SPF, DKIM, DMARC must be valid for sending domains — never imply sketchy or unauthenticated sending.
`.trim();

/** Stage 3 — module_3_icp: targeting (lead filters / signals) */
export const MODULE_3_ICP_CHECKLIST = `
STAGE 3 CHECKLIST — ICP / TARGETING MATRIX (apply when building filters, TAM notes, and signal strategy):
- TAM: Give a sane reachable-contact estimate or range before over-narrowing.
- High-intent signals: Prefer triggers like recent job posts (read the JD for goals), funding, leadership changes, hiring surges.
- Lookalikes: Where useful, describe “similar to best customers” as a targeting lens.
- Adjacency: Consider people engaging with competitor or industry content when relevant.
- Inferred personalization: Suggest hooks that infer *their* customers, stack, or motion so “how we help” lines can be specific.
`.trim();

/** Stage 4 — module_4_offers: offer pool ideation */
export const MODULE_4_OFFERS_CHECKLIST = `
STAGE 4 CHECKLIST — OFFERS / PATTERN INTERRUPT (apply to every offer idea):
- Explore breadth: Many distinct angles (vibes, mechanisms, CTAs) beat one safe guess — diversify the pool.
- Low-friction CTAs: Prefer small asks (short video, audit slice, asset, list) over a heavy “book 30 minutes” unless the brief demands it.
- Risk reversal: Where credible, include clear timelines or guarantees in the spirit of “outcome or you don’t pay.”
- Gifts: High-perceived-value deliverables (custom Loom, tight audit, small list) belong in the offer, not only in the footer.
- PLG / SaaS: When the brief is software-led, freemium / trial / product-led hooks are fair game if honest.
`.trim();

/**
 * Stage 5 — operational discipline for Tests 2–6 and live iteration.
 * (In the UI, module_5_tests unlocks the test runner — this block is for generation quality.)
 */
export const MODULE_5_TESTING_DISCIPLINE_CHECKLIST = `
TESTING & ITERATION DISCIPLINE (when generating test copy or advising on rollout):
- Portfolio split: Favor mostly proven angles, some optimized variants, and a small slice of experimental ideas (e.g. 70/20/10 style thinking).
- One variable at a time: Each test should isolate hook vs offer vs CTA vs structure so results are attributable.
- Optimize for outcomes: Prefer meetings, qualified replies, or signups over vanity reply volume when the brief cares about pipeline.
- Variation hygiene: Encourage natural variation in phrasing across steps where appropriate to reduce repetitive fingerprints (without breaking plain-text rules).
- Sequences: Prefer tight 2–3 email arcs; if a thread dies, recycle the lead later with a fresh angle rather than endless pings.
`.trim();

/** Bundled foundation for any copy that must reflect the brief + infra */
export function foundationContextForGeneration(): string {
  return [MODULE_1_BRIEF_CHECKLIST, MODULE_2_INFRA_CHECKLIST].join("\n\n");
}
