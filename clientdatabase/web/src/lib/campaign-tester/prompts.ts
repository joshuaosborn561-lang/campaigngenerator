/**
 * Prompt templates for the Campaign Testing Machine.
 *
 * Every copy-generation call to Claude MUST include:
 *   1. The full Campaign Brief (ICP, offer, plays available, infrastructure status).
 *   2. The winning choices from ALL prior completed tests.
 *   3. The specific variable being tested + the chosen variant.
 *   4. The relevant knowledge-base entry for that variant.
 *
 * The system prompt enforces: stick to the knowledge base, do not invent
 * options, output valid JSON matching the schema.
 */

import type { TestDefinition, TestVariant } from "./knowledge-base";
import { getTest, getVariant } from "./knowledge-base";
import type { Offer } from "./brief-types";
import {
  foundationContextForGeneration,
  MODULE_3_ICP_CHECKLIST,
  MODULE_4_OFFERS_CHECKLIST,
  MODULE_5_TESTING_DISCIPLINE_CHECKLIST,
} from "./module-checklists";

export interface CampaignBriefContext {
  name: string;
  icp_job_title?: string | null;
  icp_company_size?: string | null;
  icp_geography?: string | null;
  target_industry?: string | null;
  offer_description?: string | null;
  offer_type_hint?: string | null;
  available_assets?: Record<string, boolean> | null;
  infrastructure_status?: Record<string, boolean> | null;
  available_plays?: string[] | null;
}

export interface PriorTestWinner {
  test_number: number;
  variable_tested: string;
  variant_chosen: string;
}

export interface GenerationRequest {
  brief: CampaignBriefContext;
  priorWinners: PriorTestWinner[];
  testNumber: number;
  variantId: string;
  // Some tests (3, 5, 6) accept compound sub-variable picks, e.g.
  //   { title_tier: "vp_director", company_size: "51_200" }
  subVariants?: Record<string, string>;
  // Custom offer pool from Module 4 — when Test 2's variantId is of the form
  // "custom:<offerId>", the prompt builder looks up the full definition here.
  customOffers?: Offer[];
}

// -----------------------------------------------------------------------------
// System prompt
// -----------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are the copy-generation engine for SalesGlider Growth's Cold Email Campaign Testing Machine.

Your job is to write cold outreach copy (subject + plain-text body) or, for sequence/segmentation tests, segmentation criteria and sequence definitions.

STRICT RULES:
1. Generate copy that uses the chosen variant EXACTLY as specified. Do not blend variants.
2. Do NOT invent options, plays, offers, or structures outside the provided knowledge base.
3. Keep copy plain text — no HTML, no markdown formatting, no links in the body.
4. Write like a senior cold-outreach operator. No fluff, no AI tells, no em-dashes, no "I hope this email finds you well", no "I wanted to reach out".
5. Respect the brief's ICP and offer. If a winning choice was recorded in a prior test, honor it.
6. Subjects should be 2-6 words, lowercase-ish, no clickbait.
7. Bodies should be 40-90 words for initial emails. Each line should earn its place.
8. Output VALID JSON ONLY. No prose preface, no markdown fences, no commentary.

OUTPUT SCHEMA (unless overridden in the user prompt):
{
  "subject": string,
  "body_plain_text": string,
  "variant_rationale": string  // 1-2 sentences explaining how this output embodies the chosen variant
}`;

/**
 * Full system prompt for Tests 2–6 copy generation: base rules + expert stage checklists.
 */
export function buildGenerationSystemPrompt(): string {
  return [
    SYSTEM_PROMPT,
    "",
    "--- EXPERT STAGE CHECKLISTS (Modules 1–5 — apply while ideating; do not violate STRICT RULES above) ---",
    foundationContextForGeneration(),
    "",
    MODULE_3_ICP_CHECKLIST,
    "",
    MODULE_4_OFFERS_CHECKLIST,
    "",
    MODULE_5_TESTING_DISCIPLINE_CHECKLIST,
    "--- END EXPERT CHECKLISTS ---",
  ].join("\n");
}

// -----------------------------------------------------------------------------
// Shared context block
// -----------------------------------------------------------------------------

function renderBrief(brief: CampaignBriefContext): string {
  const lines: string[] = [`CAMPAIGN BRIEF: ${brief.name}`];
  if (brief.icp_job_title) lines.push(`  ICP title: ${brief.icp_job_title}`);
  if (brief.icp_company_size) lines.push(`  ICP company size: ${brief.icp_company_size}`);
  if (brief.icp_geography) lines.push(`  ICP geography: ${brief.icp_geography}`);
  if (brief.target_industry) lines.push(`  Target industry: ${brief.target_industry}`);
  if (brief.offer_description) lines.push(`  Offer: ${brief.offer_description}`);
  if (brief.offer_type_hint) lines.push(`  Offer type hint: ${brief.offer_type_hint}`);

  if (brief.available_assets && Object.keys(brief.available_assets).length > 0) {
    const yes = Object.entries(brief.available_assets)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (yes.length > 0) lines.push(`  Available assets: ${yes.join(", ")}`);
  }

  if (brief.available_plays && brief.available_plays.length > 0) {
    lines.push(`  Available plays: ${brief.available_plays.join(", ")}`);
  }

  return lines.join("\n");
}

function renderPriorWinners(winners: PriorTestWinner[]): string {
  if (!winners.length) return "PRIOR WINNERS: none (this is the first or only test).";
  const sorted = [...winners].sort((a, b) => a.test_number - b.test_number);
  const lines = ["PRIOR WINNERS (honor these in your output):"];
  for (const w of sorted) {
    const variant = getVariant(w.test_number, w.variant_chosen);
    const label = variant ? `${variant.label} — ${variant.description}` : w.variant_chosen;
    lines.push(`  Test ${w.test_number} (${w.variable_tested}): ${label}`);
  }
  return lines.join("\n");
}

function renderVariant(test: TestDefinition, variant: TestVariant | null): string {
  if (!variant) return `CHOSEN VARIANT: ${test.variableTested} = (no variant — see sub-variables below)`;
  const lines = [
    `CHOSEN VARIANT: ${test.variableTested} = ${variant.id} (${variant.label})`,
    `  Description: ${variant.description}`,
  ];
  if (variant.generationGuidance) {
    lines.push(`  Generation guidance: ${variant.generationGuidance}`);
  }
  return lines.join("\n");
}

function renderCustomOffer(offer: Offer): string {
  const lines = [
    `CHOSEN VARIANT: offer = custom:${offer.id} (${offer.name})`,
    `  One-liner: ${offer.one_liner}`,
    `  Intended CTA: ${offer.cta}`,
  ];
  if (offer.rationale) lines.push(`  Rationale: ${offer.rationale}`);
  lines.push(
    "  Generation guidance: Write copy that makes THIS specific offer the center of the email. Do not blend with any other offer in the pool. Honor the intended CTA style; adapt wording only if needed for flow.",
  );
  return lines.join("\n");
}

function renderSubVariants(
  test: TestDefinition,
  subVariants?: Record<string, string>
): string {
  if (!subVariants || !test.subVariables?.length) return "";
  const lines = ["CHOSEN SUB-VARIANTS (honor all of these):"];
  for (const sub of test.subVariables) {
    const pick = subVariants[sub.id];
    if (!pick) continue;
    const opt = sub.options.find((o) => o.id === pick);
    if (!opt) continue;
    lines.push(`  ${sub.label}: ${opt.label} — ${opt.description}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// -----------------------------------------------------------------------------
// Per-test user prompt builders
// -----------------------------------------------------------------------------

function testBlock(req: GenerationRequest): {
  test: TestDefinition;
  variant: TestVariant | null;
  header: string;
} {
  const test = getTest(req.testNumber);
  if (!test) throw new Error(`Unknown test number: ${req.testNumber}`);

  // Test 2 supports custom offers from Module 4: variantId like "custom:<id>"
  // resolves against req.customOffers. For all other tests (and for the legacy
  // fixed offer variants) we look up in the knowledge base.
  let variant: TestVariant | null = null;
  let customRender: string | null = null;

  if (req.testNumber === 2 && req.variantId?.startsWith("custom:") && req.customOffers) {
    const id = req.variantId.slice("custom:".length);
    const offer = req.customOffers.find((o) => o.id === id);
    if (offer) {
      customRender = renderCustomOffer(offer);
    }
  }

  if (!customRender) {
    variant = req.variantId ? getVariant(req.testNumber, req.variantId) : null;
  }

  const parts = [
    renderBrief(req.brief),
    "",
    renderPriorWinners(req.priorWinners),
    "",
    `TEST ${test.number}: ${test.name}`,
    `  Variable tested: ${test.variableTested}`,
    `  Success metric: ${test.successMetric}`,
    "",
    customRender ?? renderVariant(test, variant),
  ];
  const subBlock = renderSubVariants(test, req.subVariants);
  if (subBlock) {
    parts.push("");
    parts.push(subBlock);
  }
  return { test, variant, header: parts.join("\n") };
}

/**
 * Test 2: Offer. Output a complete initial email built around the chosen offer.
 */
export function buildTest2Prompt(req: GenerationRequest): string {
  const { header } = testBlock(req);
  return (
    header +
    `\n\nTASK: Write the initial cold email for this campaign. The email must make the chosen offer the center of the message — the offer is what we are testing.\n\nOUTPUT: { "subject": string, "body_plain_text": string, "variant_rationale": string }`
  );
}

/**
 * Test 3: Persona & segmentation. Output segmentation criteria + sample
 * subject/body tailored for the segment.
 */
export function buildTest3Prompt(req: GenerationRequest): string {
  const { header } = testBlock(req);
  return (
    header +
    `\n\nTASK: 1) Describe the exact segmentation criteria for this test (who should receive it, filters to apply, buying signals to detect). 2) Write initial email copy tailored to this segment. Reuse the winning offer from Test 2 if present.\n\nOUTPUT: { "segmentation_criteria": { "title": string, "company_size": string, "buying_signal": string, "geography": string, "filters_description": string }, "subject": string, "body_plain_text": string, "variant_rationale": string }`
  );
}

/**
 * Test 4: Play & angle. Rewrite the opening/body around the chosen play.
 */
export function buildTest4Prompt(req: GenerationRequest): string {
  const { header } = testBlock(req);
  return (
    header +
    `\n\nTASK: Write the initial cold email. The FIRST line must embody the chosen play (${req.variantId}). The play is what earns the right to the rest of the message — it must be specific, evidently-researched, and feel impossible to ignore.\n\nOUTPUT: { "subject": string, "body_plain_text": string, "variant_rationale": string }`
  );
}

/**
 * Test 5: CTA & structure. Compound test — honor each sub-variant explicitly.
 */
export function buildTest5Prompt(req: GenerationRequest): string {
  const { header } = testBlock(req);
  return (
    header +
    `\n\nTASK: Write the initial cold email using the chosen body structure, CTA type, and P.S. line. Reuse the winning offer and play from prior tests.\n\nOUTPUT: { "subject": string, "body_plain_text": string, "variant_rationale": string }`
  );
}

/**
 * Test 6: Sequence. Return the whole sequence: initial + follow-ups with
 * the chosen follow-up angle per touch.
 */
export function buildTest6Prompt(req: GenerationRequest): string {
  const { header, variant } = testBlock(req);
  const sequenceSize =
    variant?.id === "three_email"
      ? 3
      : variant?.id === "five_email"
        ? 5
        : variant?.id === "multichannel"
          ? 5
          : 3;

  return (
    header +
    `\n\nTASK: Write the FULL ${sequenceSize}-touch sequence. Each touch must use a follow-up angle consistent with the chosen sub-variant. For multichannel, also specify the LinkedIn/phone actions between email touches. Reuse winners from prior tests.\n\nOUTPUT: { "sequence": [ { "step": number, "channel": "email" | "linkedin" | "phone", "delay_days": number, "angle": string, "subject": string | null, "body_plain_text": string } ], "variant_rationale": string }`
  );
}

/**
 * Dispatcher — single entrypoint used by the /generate API route.
 */
export function buildPromptForTest(req: GenerationRequest): string {
  switch (req.testNumber) {
    case 2:
      return buildTest2Prompt(req);
    case 3:
      return buildTest3Prompt(req);
    case 4:
      return buildTest4Prompt(req);
    case 5:
      return buildTest5Prompt(req);
    case 6:
      return buildTest6Prompt(req);
    default:
      throw new Error(
        `Test ${req.testNumber} does not use Claude generation (Test 1 is an infrastructure checklist).`
      );
  }
}
