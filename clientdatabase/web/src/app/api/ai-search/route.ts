import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

/**
 * POST /api/ai-search
 * Takes a natural language query and returns structured filters.
 * e.g. "Find me MSP owners" → { industry: "MSP", seniority: "c-suite", title: "owner" }
 */

const SYSTEM_PROMPT = `You convert natural language contact search queries into structured filters for a contact database.

Available filter fields:
- title: job title (partial match, e.g. "owner", "VP of Sales", "CTO")
- seniority: one of: c-suite, vp, director, manager, senior, entry
- department: one of: sales, marketing, engineering, it, operations, hr, finance, legal, product, design, customer_success, executive, security
- company: company name (partial match)
- industry: company industry (e.g. "MSP", "Cybersecurity", "SaaS", "Staffing", "Healthcare IT")
- size: company size bracket: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5000+
- country: country name
- state: state/region
- city: city name
- status: one of: new, contacted, engaged, replied, meeting_booked, customer, do_not_contact
- source: one of: smartlead, heyreach, manual, csv
- meeting: "true" or "false"
- tags: comma-separated tags

Respond with ONLY valid JSON. Map the user's intent to the most appropriate filters. Examples:

"find me MSP owners" → {"industry":"MSP","title":"owner","seniority":"c-suite"}
"VPs of sales at SaaS companies with 200+ employees" → {"title":"VP of Sales","seniority":"vp","department":"sales","industry":"SaaS","size":"201-500"}
"all contacts who booked meetings" → {"meeting":"true"}
"cybersecurity directors in California" → {"industry":"Cybersecurity","seniority":"director","state":"California"}
"people I haven't contacted yet" → {"status":"new"}`;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const genai = new GoogleGenAI({ apiKey });

    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: query,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const text = response.text ?? "{}";
    const jsonStr = text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const filters = JSON.parse(jsonStr);

    return NextResponse.json({ filters });
  } catch (err: any) {
    console.error("AI search error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
