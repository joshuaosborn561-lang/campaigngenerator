import { GoogleGenAI } from "@google/genai";
import type { ClassificationResult } from "../types/index.js";

const CLASSIFICATION_PROMPT = `You are an expert B2B cold email analyst. Analyze the following cold email campaign and classify it.

Campaign name: {campaign_name}
Subject line: {subject_line}
Email body:
---
{email_body}
---

Respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "offer_type": "one of: roi-based, pain-based, social-proof, case-study, curiosity, direct-ask, value-first, referral-ask, event-based, survey-based",
  "copy_patterns": ["array of 1-4 pattern labels from: personalization, question-opener, statistic-hook, name-drop, scarcity, short-form, long-form, ps-line, cta-question, cta-calendar, humor, storytelling, problem-agitation, before-after, listicle"],
  "target_title_guess": "best guess of target job title based on copy, or null",
  "target_industry_guess": "best guess of target industry based on copy, or null",
  "target_company_size_guess": "best guess of company size range, or null"
}`;

export class Classifier {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async classifyEmail(
    campaignName: string,
    subjectLine: string,
    emailBody: string
  ): Promise<ClassificationResult> {
    const prompt = CLASSIFICATION_PROMPT.replace(
      "{campaign_name}",
      campaignName
    )
      .replace("{subject_line}", subjectLine)
      .replace("{email_body}", emailBody);

    try {
      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = response.text ?? "";
      // Strip markdown code fences if present
      const jsonStr = text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const parsed = JSON.parse(jsonStr);

      return {
        offer_type: parsed.offer_type || "unknown",
        copy_patterns: parsed.copy_patterns || [],
        target_title_guess: parsed.target_title_guess || null,
        target_industry_guess: parsed.target_industry_guess || null,
        target_company_size_guess: parsed.target_company_size_guess || null,
      };
    } catch (err) {
      console.error("Classification failed:", err);
      return {
        offer_type: "unclassified",
        copy_patterns: [],
        target_title_guess: null,
        target_industry_guess: null,
        target_company_size_guess: null,
      };
    }
  }
}
