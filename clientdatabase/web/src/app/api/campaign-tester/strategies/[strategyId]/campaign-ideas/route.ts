import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ strategyId: string }> };

const GEMINI_MODEL = process.env.GEMINI_API_KEY ? "gemini-2.5-flash" : "";

const IDEAS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      targeting_level: { type: Type.STRING, enum: ["broad", "focused", "niche"] },
      list_filters: { type: Type.STRING },
      ai_strategy: { type: Type.STRING },
      value_prop: { type: Type.STRING },
      overview: { type: Type.STRING },
      requires_ai_personalization: { type: Type.BOOLEAN },
      recommended_front_end_offer: { type: Type.STRING },
    },
    required: [
      "name",
      "targeting_level",
      "list_filters",
      "ai_strategy",
      "value_prop",
      "overview",
      "requires_ai_personalization",
      "recommended_front_end_offer",
    ],
  },
};

function checklistText(): string {
  return [
    "Checklist (must satisfy):",
    "- Produce 15–25 ideas. More is ok if they're strong; never fewer than 15.",
    "- Each idea must be distinct (different list leverage and/or message leverage).",
    "- Include at least: 1) Creative Use-Case campaign, 2) New Hire <90d campaign, 3) Lookalike/case-study-based campaign, 4) one No-AI campaign.",
    "- Order should range from broad → focused → niche (but still relevant).",
    "- Respect hard filters; treat 'signals/triggers' as OPTIONAL list layers unless specified as hard.",
    "- Avoid fantasy data sources; only use publicly inferable signals and common B2B list filters.",
  ].join("\n");
}

async function generateIdeas(args: {
  clientName: string;
  strategyName: string;
  lane: any;
  websiteSummary: string;
  extracted: any;
}): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const genai = new GoogleGenAI({ apiKey });

  const prompt = `You are a cold outbound strategist for a B2B agency.

Client: ${args.clientName}
Strategy: ${args.strategyName}

Lane definition (JSON): ${JSON.stringify(args.lane)}

Website understanding (summary): ${args.websiteSummary || "(none)"}
Website extracted signals (JSON): ${JSON.stringify(args.extracted || {})}

Generate campaign ideas to run for this lane. Each row should specify list filters (beyond base lane), the AI/personalization strategy, and the value proposition.

${checklistText()}

Return ONLY JSON array matching the schema.`;

  const resp = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: IDEAS_SCHEMA,
    },
  });

  const raw = (resp.text ?? "").trim();
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as any[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { strategyId } = await ctx.params;
  const laneId = req.nextUrl.searchParams.get("lane_id") ?? "";
  if (!laneId) return NextResponse.json({ error: "lane_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("strategy_lane_campaign_ideas")
    .select("*")
    .eq("strategy_id", strategyId)
    .eq("lane_id", laneId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ideas: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { strategyId } = await ctx.params;
    const body = await req.json();
    const lane_id = typeof body.lane_id === "string" ? body.lane_id : "";
    const overwrite = body.overwrite === true;
    if (!lane_id) return NextResponse.json({ error: "lane_id is required" }, { status: 400 });

    const [sRes, laneRes, analysisRes] = await Promise.all([
      supabase.from("client_strategies").select("id, client_id, name").eq("id", strategyId).maybeSingle(),
      supabase
        .from("strategy_icp_lanes")
        .select("*")
        .eq("id", lane_id)
        .eq("strategy_id", strategyId)
        .maybeSingle(),
      supabase
        .from("strategy_website_analysis")
        .select("*")
        .eq("strategy_id", strategyId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (sRes.error) return NextResponse.json({ error: sRes.error.message }, { status: 500 });
    if (laneRes.error) return NextResponse.json({ error: laneRes.error.message }, { status: 500 });
    if (!sRes.data) return NextResponse.json({ error: "strategy not found" }, { status: 404 });
    if (!laneRes.data) return NextResponse.json({ error: "lane not found" }, { status: 404 });

    const { data: clientRow } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", sRes.data.client_id)
      .maybeSingle();

    const websiteSummary = (analysisRes.data as any)?.summary ?? "";
    const extracted = (analysisRes.data as any)?.extracted ?? {};

    const ideas = await generateIdeas({
      clientName: clientRow?.name ?? "Client",
      strategyName: sRes.data.name,
      lane: laneRes.data,
      websiteSummary,
      extracted,
    });

    if (ideas.length < 15) {
      return NextResponse.json(
        { error: `Gemini returned only ${ideas.length} idea(s); expected at least 15.` },
        { status: 502 }
      );
    }

    if (overwrite) {
      const { error: delErr } = await supabase
        .from("strategy_lane_campaign_ideas")
        .delete()
        .eq("strategy_id", strategyId)
        .eq("lane_id", lane_id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const rows = ideas.slice(0, 40).map((i: any) => ({
      strategy_id: strategyId,
      lane_id,
      name: String(i.name || "").trim().slice(0, 200),
      targeting_level: i.targeting_level,
      list_filters: String(i.list_filters || ""),
      ai_strategy: String(i.ai_strategy || ""),
      value_prop: String(i.value_prop || ""),
      overview: String(i.overview || ""),
      requires_ai_personalization: Boolean(i.requires_ai_personalization),
      recommended_front_end_offer: String(i.recommended_front_end_offer || ""),
      meta: { generator: "gemini-2.5-flash", checklist: "v1" },
      status: "active",
    }));

    const { data, error } = await supabase.from("strategy_lane_campaign_ideas").insert(rows).select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ideas: data ?? [] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Invalid JSON" }, { status: 400 });
  }
}

