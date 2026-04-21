/**
 * Gemini 2.5 Flash structured inference: campaign-level offer profile,
 * per-variant offer angle, and ICP from lead samples.
 * Campaign-level email understanding uses up to 25 distinct sequence variants (stratified sample).
 */

import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDepartment, parseSeniority, normalizeCompanySize } from "../utils/title-parser.js";

const MODEL = "gemini-2.5-flash";

/** Max distinct emails (step+variant bodies) sent to Gemini for campaign-level offer/ICP email context */
export const OFFER_EMAIL_SAMPLE_CAP = 25;

export function hashSequenceSteps(
  rows: Array<{ subject_line: string | null; email_body: string | null; step_number: number; variant_label: string | null }>
): string {
  const sorted = [...rows].sort((a, b) => {
    if (a.step_number !== b.step_number) return a.step_number - b.step_number;
    return (a.variant_label || "").localeCompare(b.variant_label || "");
  });
  const payload = sorted
    .map(
      (r) =>
        `${r.step_number}|${r.variant_label || "A"}|${(r.subject_line || "").trim()}|${(r.email_body || "").trim()}`
    )
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

export function hashStepContent(subject: string | null | undefined, body: string | null | undefined): string {
  return createHash("sha256")
    .update(`${(subject || "").trim()}\n${(body || "").trim()}`)
    .digest("hex");
}

/** Fingerprint for the specific ≤25 email bodies used in campaign-level Gemini calls */
export function hashOfferEmailSample(
  variants: Array<{ step_number: number; variant_label: string; subject: string; body: string }>
): string {
  const sorted = [...variants].sort((a, b) => {
    if (a.step_number !== b.step_number) return a.step_number - b.step_number;
    return a.variant_label.localeCompare(b.variant_label);
  });
  const payload = sorted
    .map((v) => `${v.step_number}|${v.variant_label}|${v.subject.trim()}|${v.body.trim()}`)
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Apollo / ZoomInfo–style dimensions for WHO the campaign targets (inferred from lead samples + copy).
 * Values are best-effort from available data; use empty string / empty array when unknown.
 */
const APOLLO_STYLE_ICP_SIGNALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    technologies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Tech stack / tools associated with accounts (e.g. Salesforce, HubSpot) when inferable",
    },
    funding_stage: {
      type: Type.STRING,
      description: "Company funding or stage: bootstrapped, seed, series_a–c, pe, public — empty if unknown",
    },
    job_function: {
      type: Type.STRING,
      description: "Broader function bucket: Sales, Marketing, IT, HR, Finance, Operations — empty if mixed/unknown",
    },
    hq_location: {
      type: Type.STRING,
      description: "HQ region focus if distinct from person location (e.g. US HQ, EMEA HQ)",
    },
    person_keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Skills, topics, certifications on personas when visible in titles or enrichment",
    },
    buying_intent_topics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Intent or surge topics (hiring, migration, funding news) if inferable from samples",
    },
    naics_or_industry_code: {
      type: Type.STRING,
      description: "Industry taxonomy hint (NAICS/SIC/vertical label) — empty if unknown",
    },
    company_public_private: {
      type: Type.STRING,
      description: "public | private | unknown",
    },
    years_in_role: {
      type: Type.STRING,
      description: "Seniority tenure band if inferable (e.g. 'new in role', 'veteran') — empty if unknown",
    },
    education_summary: {
      type: Type.STRING,
      description: "Education level signal if ever present — usually empty",
    },
    employee_count_band: {
      type: Type.STRING,
      description: "Employee count bracket consistent with company_size_range (e.g. 51-200)",
    },
  },
  required: [
    "technologies",
    "funding_stage",
    "job_function",
    "hq_location",
    "person_keywords",
    "buying_intent_topics",
    "naics_or_industry_code",
    "company_public_private",
    "years_in_role",
    "education_summary",
    "employee_count_band",
  ],
};

/**
 * Same “Apollo-style” dimensions interpreted from OUTBOUND COPY (what the emails imply about targeting).
 */
const APOLLO_STYLE_EMAIL_SIGNALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    technologies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Tools/platforms explicitly mentioned in copy",
    },
    funding_stage: {
      type: Type.STRING,
      description: "Stage language in copy (e.g. 'fast-growing', 'PE-backed') — empty if none",
    },
    job_function: {
      type: Type.STRING,
      description: "Function the copy speaks to (Sales, RevOps, IT) — empty if broad",
    },
    hq_location: {
      type: Type.STRING,
      description: "Geo or HQ references in copy",
    },
    person_keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Role skills or topics referenced in copy",
    },
    buying_intent_topics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Triggers in copy (hiring, migration, compliance deadline)",
    },
    naics_or_industry_code: {
      type: Type.STRING,
      description: "Named verticals/industries in copy",
    },
    company_public_private: {
      type: Type.STRING,
      description: "public | private | unknown from copy",
    },
    years_in_role: {
      type: Type.STRING,
      description: "Tenure hints in copy — empty if none",
    },
    education_summary: {
      type: Type.STRING,
      description: "Education references — usually empty",
    },
    employee_count_band: {
      type: Type.STRING,
      description: "Company size language in copy (headcount bands)",
    },
  },
  required: [
    "technologies",
    "funding_stage",
    "job_function",
    "hq_location",
    "person_keywords",
    "buying_intent_topics",
    "naics_or_industry_code",
    "company_public_private",
    "years_in_role",
    "education_summary",
    "employee_count_band",
  ],
};

const OFFER_PROFILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    offer_type: {
      type: Type.STRING,
      description: "High-level angle: roi-based, pain-based, social-proof, case-study, curiosity, direct-ask, value-first, event-based, incentive-led, other",
    },
    incentive_summary: {
      type: Type.STRING,
      description: "Concrete incentive if any: tickets, free trial days, audit, lead magnet, etc., or empty string if none",
    },
    respond_now_reason: {
      type: Type.STRING,
      description: "Why would the prospect reply *now* (urgency, deadline, season, trigger event, scarcity). Empty if none.",
    },
    ai_enrichment_typical: {
      type: Type.STRING,
      description: "yes | no | mixed — whether sequences typically use AI-style personalization beyond mail-merge",
    },
    ai_enrichment_examples: {
      type: Type.STRING,
      description: "Short examples of AI-flavored lines if any; empty if none",
    },
    post_offer_hook_pattern: {
      type: Type.STRING,
      description: "After stating the offer/incentive, what does the sequence usually talk about (pain, peer story, proof, question)?",
    },
    case_studies_mentioned: { type: Type.BOOLEAN },
    social_proof_style: {
      type: Type.STRING,
      description: "none | logos | metrics | testimonials | peer_comparison | other",
    },
    social_proof_detail: {
      type: Type.STRING,
      description: "Across variants: named case study/customer, specific metrics, ROI or % claims if any; empty if none",
    },
    risk_reversal_summary: {
      type: Type.STRING,
      description: "Guarantees, pilots, opt-outs, 'no pitch', refunds, low-commitment CTAs — empty if none",
    },
    approximate_word_count_band: {
      type: Type.STRING,
      description: "e.g. 'under 120 words' or '200-350'",
    },
    primary_cta: {
      type: Type.STRING,
      description: "reply | calendar | call | resource | meeting | other",
    },
    apollo_style_email_signals: APOLLO_STYLE_EMAIL_SIGNALS_SCHEMA,
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
  },
  required: [
    "offer_type",
    "incentive_summary",
    "respond_now_reason",
    "ai_enrichment_typical",
    "ai_enrichment_examples",
    "post_offer_hook_pattern",
    "case_studies_mentioned",
    "social_proof_style",
    "social_proof_detail",
    "risk_reversal_summary",
    "approximate_word_count_band",
    "primary_cta",
    "apollo_style_email_signals",
    "confidence",
  ],
};

const VARIANT_ANGLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    offer_type: { type: Type.STRING },
    incentive_summary: { type: Type.STRING },
    respond_now_reason: {
      type: Type.STRING,
      description: "Why reply now in THIS message (urgency, deadline, timely hook). Empty if not present.",
    },
    ai_enrichment_present: { type: Type.BOOLEAN },
    ai_enrichment_note: {
      type: Type.STRING,
      description: "What looks AI-generated or hyper-personalized; empty if ai_enrichment_present is false",
    },
    post_offer_hook: {
      type: Type.STRING,
      description: "After the incentive/offer, what does the copy discuss (problem, story, proof, question)?",
    },
    hook_style: {
      type: Type.STRING,
      description: "Legacy style tag: problem_first | curiosity | social_proof | question_led | compliment_led | story | other",
    },
    main_pain_addressed: { type: Type.STRING },
    social_proof_case_study: {
      type: Type.STRING,
      description: "Named customer, logo, or case label if any; empty if none",
    },
    social_proof_metrics: {
      type: Type.STRING,
      description: "Concrete numbers, KPIs, or ROI claims; empty if none",
    },
    risk_reversal: {
      type: Type.STRING,
      description: "Guarantee, pilot, risk-free language, opt-out; empty if none",
    },
    cta_type: { type: Type.STRING },
    assets_used: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "e.g. case study, stat, named client, competitor mention",
    },
    apollo_style_email_signals: APOLLO_STYLE_EMAIL_SIGNALS_SCHEMA,
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: [
    "offer_type",
    "incentive_summary",
    "respond_now_reason",
    "ai_enrichment_present",
    "ai_enrichment_note",
    "post_offer_hook",
    "hook_style",
    "main_pain_addressed",
    "social_proof_case_study",
    "social_proof_metrics",
    "risk_reversal",
    "cta_type",
    "assets_used",
    "apollo_style_email_signals",
    "confidence",
  ],
};

const ICP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title_patterns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Distinct job title clusters (e.g. 'VP Sales', 'Head of People')",
    },
    seniority_focus: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "c-suite, vp, director, manager, senior, entry, etc.",
    },
    departments: { type: Type.ARRAY, items: { type: Type.STRING } },
    org_functions_note: {
      type: Type.STRING,
      description: "Short clarification of functional focus (e.g. 'mostly GTM leaders, some HR')",
    },
    company_profile: {
      type: Type.STRING,
      description: "Who the company is: industry segment, B2B/B2C, typical account types",
    },
    geography_summary: { type: Type.STRING },
    primary_locations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "City, region, or country strings seen in samples (dedupe)",
    },
    industry_primary: { type: Type.STRING },
    industry_secondary: { type: Type.STRING, description: "Secondary industry or empty string if none" },
    company_size_range: { type: Type.STRING },
    revenue_band: { type: Type.STRING, description: "Typical company revenue band if inferable from samples" },
    apollo_style_icp_signals: APOLLO_STYLE_ICP_SIGNALS_SCHEMA,
    sample_notes: { type: Type.STRING, description: "One concrete sentence, e.g. 'Mostly Owners at small MSPs in Texas'" },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: [
    "title_patterns",
    "seniority_focus",
    "departments",
    "org_functions_note",
    "company_profile",
    "geography_summary",
    "primary_locations",
    "industry_primary",
    "industry_secondary",
    "company_size_range",
    "revenue_band",
    "apollo_style_icp_signals",
    "sample_notes",
    "confidence",
  ],
};

export type LeadSample = {
  title: string | null;
  company: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  company_size: string | null;
  company_revenue: string | null;
  seniority: string | null;
  department: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  has_replied: boolean | null;
  is_unsubscribed: boolean | null;
  is_hostile: boolean | null;
};

export type EmailVariantInput = {
  step_number: number;
  variant_label: string;
  subject: string;
  body: string;
};

export class InferenceService {
  private genai: GoogleGenAI;

  constructor(apiKey: string) {
    this.genai = new GoogleGenAI({ apiKey });
  }

  async inferOfferProfileAcrossVariants(
    campaignName: string,
    variants: EmailVariantInput[],
    meta: { total_variants_in_campaign: number; sampled_for_gemini: number }
  ): Promise<Record<string, unknown>> {
    const lines = variants
      .map(
        (v, idx) =>
          `--- Email ${idx + 1}/${variants.length} — Step ${v.step_number} variant ${v.variant_label} ---\nSubject: ${v.subject}\n\nBody:\n${v.body}`
      )
      .join("\n\n");

    const prompt = `You are analyzing a STRATIFIED SAMPLE of up to ${OFFER_EMAIL_SAMPLE_CAP} distinct outbound messages from one campaign (email and/or LinkedIn).
Campaign name: ${campaignName}
Total sequence variants in this campaign (all steps × A/B): ${meta.total_variants_in_campaign}.
This prompt contains ${meta.sampled_for_gemini} sampled messages — use them as representative of the full sequence.

${lines}

Infer the overall offer strategy. Fill every schema field; use empty string, empty arrays, or false when absent.

Cover explicitly:
- Concrete incentive (what they get) and separately "why respond now" (urgency, deadline, scarcity, timely trigger).
- Whether copy looks AI-enriched (hyper-personalization, "noticed your post", obvious merge tricks) — yes/no/mixed plus a short example line if any.
- After the core offer/incentive, what the copy usually talks about next — post_offer_hook_pattern.
- Social proof: style plus named case study/customer, metrics, ROI or % claims if present.
- Risk reversal: guarantees, pilots, opt-outs, low-commitment framing.
- Length band (first touch vs follow-ups if different) and primary CTA style.
- apollo_style_email_signals: ten B2B-database-style dimensions IMPLIED BY THE COPY (technologies mentioned, funding/stage language, job function spoken to, HQ/geo, person keywords, intent triggers, industry/vertical, public vs private, tenure hints, headcount language). Use empty values when not present.

Return ONLY JSON matching the schema.`;

    const response = await this.genai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: OFFER_PROFILE_SCHEMA,
      },
    });

    const text = response.text ?? "{}";
    return JSON.parse(text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim()) as Record<
      string,
      unknown
    >;
  }

  async inferVariantOfferAngle(
    campaignName: string,
    stepNumber: number,
    variantLabel: string,
    subject: string,
    body: string
  ): Promise<Record<string, unknown>> {
    const prompt = `Analyze this single cold outbound message variant.

Campaign: ${campaignName}
Step: ${stepNumber}, Variant: ${variantLabel}

Subject: ${subject}

Body:
${body}

Decompose this message:
- Incentive / core offer and separately why reply *now* if present.
- Whether AI-style enrichment appears in this variant (boolean + one-line note).
- After the offer line, what the body discusses (post_offer_hook) vs hook_style tag.
- Social proof: named case/customer and specific metrics or ROI if any.
- Risk reversal language if any.
- Main pain, CTA, hook_style, and assets_used (case study, stats, etc.).
- apollo_style_email_signals: same ten dimensions as in campaign-level, but ONLY what appears in THIS message.

Return ONLY JSON matching the schema.`;

    const response = await this.genai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: VARIANT_ANGLE_SCHEMA,
      },
    });

    const text = response.text ?? "{}";
    return JSON.parse(text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim()) as Record<
      string,
      unknown
    >;
  }

  async inferIcpFromLeads(
    campaignName: string,
    offerProfileJson: Record<string, unknown> | null,
    leads: LeadSample[]
  ): Promise<Record<string, unknown>> {
    const offerBit = offerProfileJson
      ? `\nKnown offer profile (from email sample): ${JSON.stringify(offerProfileJson)}\n`
      : "";

    const rows = leads.map((l, i) => ({
      i: i + 1,
      title: l.title,
      company: l.company,
      company_domain: l.company_domain,
      linkedin_url: l.linkedin_url,
      industry: l.industry,
      company_size: l.company_size,
      revenue: l.company_revenue,
      seniority: l.seniority,
      department: l.department,
      location: [l.city, l.state, l.country].filter(Boolean).join(", ") || null,
      timezone: l.timezone,
      has_replied: l.has_replied,
      is_unsubscribed: l.is_unsubscribed,
      is_hostile: l.is_hostile,
    }));

    const prompt = `You're inferring the REAL target ICP for this outbound campaign from a random sample of ${leads.length} leads/prospects (max 25; fewer if not enough rows in the database).

Campaign name: ${campaignName}
${offerBit}
Lead sample (JSON): ${JSON.stringify(rows, null, 2)}

ICP factors are identified from:
- Structured fields on each row (title, seniority, department, company, industry, size, revenue, location, domain, engagement flags).
- Heuristic seniority/department may be pre-filled from job title parsing.
- apollo_style_icp_signals: infer ten B2B-database-style dimensions (technologies, funding stage, job function, HQ vs person geo, persona keywords, buying intent, NAICS/vertical, public/private, years in role, education, employee band) from whatever the data supports — use empty strings/arrays when unknown.

Produce a structured ICP that covers:
- title_patterns, seniority_focus, departments, org_functions_note, company_profile
- geography_summary, primary_locations, industry_primary, industry_secondary, company_size_range, revenue_band
- apollo_style_icp_signals (required object)
- sample_notes and confidence

Be specific. If titles cluster (e.g. Owners at MSPs in Texas), say that. Do not generalize to "IT decision-makers" unless the data supports it.
Return ONLY JSON matching the schema.`;

    const response = await this.genai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: ICP_SCHEMA,
      },
    });

    const text = response.text ?? "{}";
    return JSON.parse(text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim()) as Record<
      string,
      unknown
    >;
  }
}

/** Enrich lead row from title / optional API fields */
export function enrichLeadFields(lead: {
  title?: string | null;
  industry?: string | null;
  company_size?: string | null;
  company_revenue?: string | null;
}): { seniority?: string; department?: string; industry?: string; company_size?: string; company_revenue?: string } {
  const seniority = parseSeniority(lead.title);
  const department = parseDepartment(lead.title);
  return {
    seniority,
    department,
    industry: lead.industry ?? undefined,
    company_size: normalizeCompanySize(lead.company_size) ?? lead.company_size ?? undefined,
    company_revenue: lead.company_revenue ?? undefined,
  };
}

const SAMPLE_SIZE = 25;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function sortVariantsStable<T extends { variant_label: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.variant_label || "A").localeCompare(b.variant_label || "A"));
}

/**
 * Pick up to `cap` distinct outbound messages: prefer step 1, spread across steps,
 * include at most one variant per (step, first line of body) to diversify.
 */
export function pickEmailSampleForInference(
  steps: Array<{
    step_number: number;
    variant_label: string | null;
    subject_line: string | null;
    email_body: string | null;
  }>,
  cap: number = OFFER_EMAIL_SAMPLE_CAP
): EmailVariantInput[] {
  type Row = (typeof steps)[0];
  const withBody = steps.filter((s) => (s.email_body || "").trim().length > 0);
  if (withBody.length === 0) return [];

  const byStep = new Map<number, Row[]>();
  for (const s of withBody) {
    const list = byStep.get(s.step_number) ?? [];
    list.push(s);
    byStep.set(s.step_number, list);
  }

  const stepNums = [...byStep.keys()].sort((a, b) => a - b);
  const queues = stepNums.map((sn) => sortVariantsStable(byStep.get(sn) ?? []));
  const picked: EmailVariantInput[] = [];
  const seenBodyPrefix = new Set<string>();

  const pushVariant = (s: Row) => {
    if (picked.length >= cap) return;
    const body = (s.email_body || "").trim();
    const subj = (s.subject_line || "").trim();
    const fingerprint = `${s.step_number}|${body.slice(0, 120)}`;
    if (seenBodyPrefix.has(fingerprint)) return;
    seenBodyPrefix.add(fingerprint);
    picked.push({
      step_number: s.step_number,
      variant_label: s.variant_label || "A",
      subject: subj,
      body,
    });
  };

  // Interleave steps (1st email from step 1, then step 2, …) up to cap — approximates stratified sample
  let idx = 0;
  while (picked.length < cap) {
    let advanced = false;
    for (const q of queues) {
      if (picked.length >= cap) break;
      if (idx < q.length) {
        pushVariant(q[idx]);
        advanced = true;
      }
    }
    idx++;
    if (!advanced) break;
    if (idx > 200) break;
  }

  return picked.sort((a, b) => {
    if (a.step_number !== b.step_number) return a.step_number - b.step_number;
    return a.variant_label.localeCompare(b.variant_label);
  });
}

export async function pickRandomLeadSamples(
  db: SupabaseClient,
  campaignId: string
): Promise<LeadSample[]> {
  const { data: leadRows, error: leadErr } = await db
    .from("leads")
    .select(
      "title, company, industry, company_size, company_revenue, seniority, department, city, state, country, has_replied, is_unsubscribed, is_hostile"
    )
    .eq("campaign_id", campaignId);

  if (!leadErr && leadRows && leadRows.length > 0) {
    const shuffled = shuffle(leadRows);
    const picked = shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));
    return picked.map((r) => ({
      title: r.title,
      company: r.company,
      company_domain: null,
      linkedin_url: null,
      industry: r.industry,
      company_size: r.company_size,
      company_revenue: r.company_revenue,
      seniority: r.seniority,
      department: r.department,
      city: r.city,
      state: r.state,
      country: r.country,
      timezone: null,
      has_replied: r.has_replied ?? null,
      is_unsubscribed: r.is_unsubscribed ?? null,
      is_hostile: r.is_hostile ?? null,
    }));
  }

  const { data: links, error: linkErr } = await db
    .from("contact_campaigns")
    .select("contact_id, lead_id")
    .eq("campaign_id", campaignId);

  if (linkErr || !links?.length) return [];

  const contactIds = [...new Set(links.map((l) => l.contact_id).filter(Boolean))] as string[];
  if (contactIds.length === 0) return [];

  const { data: contacts, error: cErr } = await db
    .from("contacts")
    .select(
      "id, title, company_name, company_domain, linkedin_url, company_industry, company_size, company_revenue, seniority, department, city, state, country, timezone, is_unsubscribed, is_hostile_opt_out, overall_status"
    )
    .in("id", contactIds);

  if (cErr || !contacts?.length) return [];

  const leadIds = [...new Set(links.map((l) => l.lead_id).filter(Boolean))] as string[];
  const leadById = new Map<string, { has_replied?: boolean; is_unsubscribed?: boolean; is_hostile?: boolean }>();
  if (leadIds.length > 0) {
    const { data: leadRows } = await db
      .from("leads")
      .select("id, has_replied, is_unsubscribed, is_hostile")
      .in("id", leadIds);
    for (const row of leadRows ?? []) {
      leadById.set(row.id, {
        has_replied: row.has_replied,
        is_unsubscribed: row.is_unsubscribed,
        is_hostile: row.is_hostile,
      });
    }
  }

  const leadByContact = new Map<string, { has_replied?: boolean; is_unsubscribed?: boolean; is_hostile?: boolean }>();
  for (const link of links) {
    if (!link.contact_id || !link.lead_id) continue;
    const lf = leadById.get(link.lead_id);
    if (lf) leadByContact.set(link.contact_id, lf);
  }

  const flat: LeadSample[] = contacts.map((contact) => {
    const fromLead = leadByContact.get(contact.id);
    const replied =
      fromLead?.has_replied ??
      (contact.overall_status === "replied" || contact.overall_status === "meeting_booked" ? true : null);
    return {
      title: contact.title,
      company: contact.company_name,
      company_domain: contact.company_domain,
      linkedin_url: contact.linkedin_url,
      industry: contact.company_industry,
      company_size: contact.company_size,
      company_revenue: contact.company_revenue,
      seniority: contact.seniority,
      department: contact.department,
      city: contact.city,
      state: contact.state,
      country: contact.country,
      timezone: contact.timezone,
      has_replied: replied,
      is_unsubscribed: fromLead?.is_unsubscribed ?? contact.is_unsubscribed ?? null,
      is_hostile: fromLead?.is_hostile ?? contact.is_hostile_opt_out ?? null,
    };
  });

  return shuffle(flat).slice(0, Math.min(SAMPLE_SIZE, flat.length));
}
