/**
 * Gemini 2.5 Flash structured inference: campaign-level offer profile,
 * per-variant offer angle, and ICP from lead samples.
 */

import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDepartment, parseSeniority, normalizeCompanySize } from "../utils/title-parser.js";

const MODEL = "gemini-2.5-flash";

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

const OFFER_PROFILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    offer_type: {
      type: Type.STRING,
      description: "High-level angle: roi-based, pain-based, social-proof, case-study, curiosity, direct-ask, value-first, event-based, incentive-led, other",
    },
    incentive_summary: {
      type: Type.STRING,
      description: "Concrete incentive if any: tickets, free trial days, audit, lead magnet, etc., or null if none",
    },
    case_studies_mentioned: { type: Type.BOOLEAN },
    social_proof_style: {
      type: Type.STRING,
      description: "none | logos | metrics | testimonials | peer_comparison | other",
    },
    approximate_word_count_band: {
      type: Type.STRING,
      description: "e.g. 'under 120 words' or '200-350'",
    },
    primary_cta: {
      type: Type.STRING,
      description: "reply | calendar | call | resource | meeting | other",
    },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
  },
  required: [
    "offer_type",
    "incentive_summary",
    "case_studies_mentioned",
    "social_proof_style",
    "approximate_word_count_band",
    "primary_cta",
    "confidence",
  ],
};

const VARIANT_ANGLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    offer_type: { type: Type.STRING },
    incentive_summary: { type: Type.STRING },
    hook_style: {
      type: Type.STRING,
      description: "problem_first | curiosity | social_proof | question_led | compliment_led | story | other",
    },
    main_pain_addressed: { type: Type.STRING },
    cta_type: { type: Type.STRING },
    assets_used: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "e.g. case study, stat, named client, competitor mention",
    },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: [
    "offer_type",
    "incentive_summary",
    "hook_style",
    "main_pain_addressed",
    "cta_type",
    "assets_used",
    "confidence",
  ],
};

const ICP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title_patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
    seniority_focus: { type: Type.ARRAY, items: { type: Type.STRING } },
    departments: { type: Type.ARRAY, items: { type: Type.STRING } },
    geography_summary: { type: Type.STRING },
    industry_primary: { type: Type.STRING },
    industry_secondary: { type: Type.STRING, description: "Secondary industry or empty string if none" },
    company_size_range: { type: Type.STRING },
    revenue_band: { type: Type.STRING, description: "Typical revenue if inferable from samples" },
    sample_notes: { type: Type.STRING, description: "One concrete sentence, e.g. 'Mostly Owners at small MSPs in Texas'" },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: [
    "title_patterns",
    "seniority_focus",
    "departments",
    "geography_summary",
    "industry_primary",
    "industry_secondary",
    "company_size_range",
    "revenue_band",
    "sample_notes",
    "confidence",
  ],
};

export type LeadSample = {
  title: string | null;
  company: string | null;
  industry: string | null;
  company_size: string | null;
  company_revenue: string | null;
  seniority: string | null;
  department: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export class InferenceService {
  private genai: GoogleGenAI;

  constructor(apiKey: string) {
    this.genai = new GoogleGenAI({ apiKey });
  }

  async inferOfferProfileAcrossVariants(
    campaignName: string,
    variants: Array<{ step_number: number; variant_label: string; subject: string; body: string }>
  ): Promise<Record<string, unknown>> {
    const lines = variants
      .map(
        (v) =>
          `--- Step ${v.step_number} variant ${v.variant_label} ---\nSubject: ${v.subject}\n\nBody:\n${v.body}`
      )
      .join("\n\n");

    const prompt = `You are analyzing ALL variants/steps of one cold outbound campaign (email and/or LinkedIn sequences combined).
Campaign name: ${campaignName}

${lines}

Infer the overall offer strategy and incentives across the sequence. Focus on:
- What concrete incentive is promised (free days, audit, tickets, lead magnet, etc.) — not a generic business description.
- Whether case studies / proof / social proof appear.
- Approximate length band of the first touch vs later steps if they differ (summarize).
- Primary CTA style.

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

Infer offer structure: concrete incentive (if any), hook style, main pain, CTA, and assets (case study, stats, etc.).
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
      ? `\nKnown offer profile (from copy): ${JSON.stringify(offerProfileJson)}\n`
      : "";

    const rows = leads.map((l, i) => ({
      i: i + 1,
      title: l.title,
      company: l.company,
      industry: l.industry,
      company_size: l.company_size,
      revenue: l.company_revenue,
      seniority: l.seniority,
      department: l.department,
      location: [l.city, l.state, l.country].filter(Boolean).join(", ") || null,
    }));

    const prompt = `You're inferring the REAL target ICP for this outbound campaign from a random sample of ${leads.length} leads (all leads if fewer than 25 were available).

Campaign name: ${campaignName}
${offerBit}
Lead sample (JSON): ${JSON.stringify(rows, null, 2)}

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

export async function pickRandomLeadSamples(
  db: SupabaseClient,
  campaignId: string
): Promise<LeadSample[]> {
  const { data: leadRows, error: leadErr } = await db
    .from("leads")
    .select("title, company, industry, company_size, company_revenue, seniority, department, city, state, country")
    .eq("campaign_id", campaignId);

  if (!leadErr && leadRows && leadRows.length > 0) {
    const shuffled = [...leadRows].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));
    return picked.map((r) => ({
      title: r.title,
      company: r.company,
      industry: r.industry,
      company_size: r.company_size,
      company_revenue: r.company_revenue,
      seniority: r.seniority,
      department: r.department,
      city: r.city,
      state: r.state,
      country: r.country,
    }));
  }

  // HeyReach-heavy flows: prospects may only exist on `contacts` via contact_campaigns
  const { data: links, error: linkErr } = await db
    .from("contact_campaigns")
    .select("contact_id")
    .eq("campaign_id", campaignId);

  if (linkErr || !links?.length) return [];

  const ids = [...new Set(links.map((l) => l.contact_id).filter(Boolean))] as string[];
  if (ids.length === 0) return [];

  const { data: contacts, error: cErr } = await db
    .from("contacts")
    .select(
      "title, company_name, company_industry, company_size, company_revenue, seniority, department, city, state, country"
    )
    .in("id", ids);

  if (cErr || !contacts?.length) return [];

  const flat: LeadSample[] = contacts.map((contact) => ({
    title: contact.title,
    company: contact.company_name,
    industry: contact.company_industry,
    company_size: contact.company_size,
    company_revenue: contact.company_revenue,
    seniority: contact.seniority,
    department: contact.department,
    city: contact.city,
    state: contact.state,
    country: contact.country,
  }));

  const shuffled = [...flat].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));
}
