import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ strategyId: string }> };

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    // avoid caching across runs
    cache: "no-store",
    headers: { "User-Agent": "SalesGlider.ai Agency Intelligence (onboarding analyzer)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html") && !ct.includes("text/plain")) {
    // still try to parse as text; many sites mislabel
  }
  return await res.text();
}

function stripHtml(html: string): string {
  // quick-and-safe: remove scripts/styles, then tags, collapse whitespace
  const noScripts = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ");
  return noScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const EXTRACT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    business_summary: { type: Type.STRING, description: "1-2 sentence summary of what they sell and to whom" },
    value_prop: { type: Type.STRING, description: "What outcome they promise (not features)" },
    primary_buyers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Likely buyer titles / roles" },
    industries: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Industries/verticals mentioned" },
    geo: { type: Type.STRING, description: "Geography served if stated" },
    pricing_signal: { type: Type.STRING, description: "Any pricing/packaging signal; empty if none" },
    proof_points: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Concrete proof: metrics, named results, quotes; keep short",
    },
    case_studies: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { company: { type: Type.STRING }, metric: { type: Type.STRING } }, required: ["company", "metric"] },
      description: "If you can identify named customers/case studies, list them; metric can be empty string",
    },
    constraints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Legal/compliance or deliverability constraints implied (e.g. regulated industry claims).",
    },
    proposed_icp_lanes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          lane_name: { type: Type.STRING },
          description: { type: Type.STRING },
          titles: { type: Type.ARRAY, items: { type: Type.STRING } },
          departments: { type: Type.ARRAY, items: { type: Type.STRING } },
          industries: { type: Type.ARRAY, items: { type: Type.STRING } },
          company_size: { type: Type.STRING },
          geography: { type: Type.STRING },
          exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
          signals: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["lane_name", "description", "titles", "departments", "industries", "company_size", "geography", "exclusions", "signals"],
      },
      description: "2-4 suggested lanes (e.g. midmarket vs enterprise). Keep lanes distinct.",
    },
  },
  required: [
    "business_summary",
    "value_prop",
    "primary_buyers",
    "industries",
    "geo",
    "pricing_signal",
    "proof_points",
    "case_studies",
    "constraints",
    "proposed_icp_lanes",
  ],
};

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { strategyId } = await ctx.params;
    const url = req.nextUrl.searchParams.get("website_url")?.trim() ?? "";

    if (url) {
      const { data, error } = await supabase
        .from("strategy_website_analysis")
        .select("*")
        .eq("strategy_id", strategyId)
        .eq("website_url", url)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ analysis: data ?? null });
    }

    const { data, error } = await supabase
      .from("strategy_website_analysis")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = Array.isArray(data) ? data[0] ?? null : null;
    return NextResponse.json({ analysis: row });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load analysis" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { strategyId } = await ctx.params;
    const body = await req.json();
    const website_url = typeof body.website_url === "string" ? body.website_url.trim() : "";
    if (!website_url) return NextResponse.json({ error: "website_url is required" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    const genai = new GoogleGenAI({ apiKey });

    // Pull minimal context from DB (optional but helps grounding)
    const { data: strategyRow, error: sErr } = await supabase
      .from("client_strategies")
      .select("id, client_id, name, what_they_do, measurable_outcome, timeline_claim, named_results, core_pain")
      .eq("id", strategyId)
      .maybeSingle();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!strategyRow) return NextResponse.json({ error: "strategy not found" }, { status: 404 });

    // Fetch homepage only (fast + reliable). Later we can crawl nav links.
    const rawHtml = await fetchText(website_url);
    const pageText = stripHtml(rawHtml).slice(0, 120000);

    const prompt = `You are helping onboard a net-new outbound client for an agency.\n\nClient strategy name: ${strategyRow.name}\nExisting notes (may be blank):\n- what_they_do: ${strategyRow.what_they_do ?? ""}\n- measurable_outcome: ${strategyRow.measurable_outcome ?? ""}\n- timeline_claim: ${strategyRow.timeline_claim ?? ""}\n- named_results: ${strategyRow.named_results ?? ""}\n- core_pain: ${strategyRow.core_pain ?? ""}\n\nWebsite URL: ${website_url}\nWebsite text (homepage, cleaned):\n${pageText}\n\nExtract a structured onboarding brief.\nRules:\n- Be concrete; prefer exact wording from the website where possible.\n- If you cannot find something, return empty string/empty arrays.\n- Proposed ICP lanes should include multiple buyer titles/departments within each lane when appropriate.\n- Propose at least 2 lanes if there are clear midmarket vs enterprise differences; otherwise propose 1-2.\n\nReturn JSON only, matching the schema.`;

    const resp = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: EXTRACT_SCHEMA },
    });

    const text = (resp.text ?? "{}").trim();
    const extracted = JSON.parse(text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim()) as Record<
      string,
      unknown
    >;

    const summary = String((extracted as any).business_summary ?? "").slice(0, 4000);

    const { data: saved, error: insErr } = await supabase
      .from("strategy_website_analysis")
      .upsert(
        {
          strategy_id: strategyId,
          website_url,
          extracted,
          summary,
        },
        { onConflict: "strategy_id,website_url" }
      )
      .select("*")
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ analysis: saved }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to analyze website" }, { status: 500 });
  }
}

