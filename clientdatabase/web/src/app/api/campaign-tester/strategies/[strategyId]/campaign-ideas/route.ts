import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaude, parseJsonFromClaude } from "@/lib/campaign-tester/claude-client";

type Ctx = { params: Promise<{ strategyId: string }> };

type IdeaRow = {
  name: string;
  targeting_level: "broad" | "focused" | "niche";
  list_filters: string;
  ai_strategy: string;
  value_prop: string;
  overview: string;
  requires_ai_personalization: boolean;
  recommended_front_end_offer: string;
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

const JSON_SHAPE = `Return ONLY a JSON array (no markdown) of 15-25 objects. Each object must have exactly these keys:
- name (string)
- targeting_level: "broad" | "focused" | "niche"
- list_filters (string)
- ai_strategy (string) — how to personalize or research at scale; for no-AI ideas say "none" and set requires_ai_personalization to false
- value_prop (string)
- overview (string) — enough for a copywriter to execute
- requires_ai_personalization (boolean)
- recommended_front_end_offer (string) — can be empty string if none`;

function normalizeIdeas(raw: unknown): IdeaRow[] {
  const arr: unknown[] = Array.isArray(raw) ? raw : (raw as { ideas?: unknown })?.ideas != null ? (raw as any).ideas : [];
  if (!Array.isArray(arr)) return [];
  const out: IdeaRow[] = [];
  const levels = new Set(["broad", "focused", "niche"]);
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const tl = String(o.targeting_level ?? "focused");
    const targeting_level = levels.has(tl) ? (tl as IdeaRow["targeting_level"]) : "focused";
    out.push({
      name: String(o.name ?? "").trim() || "Unnamed idea",
      targeting_level,
      list_filters: String(o.list_filters ?? ""),
      ai_strategy: String(o.ai_strategy ?? ""),
      value_prop: String(o.value_prop ?? ""),
      overview: String(o.overview ?? ""),
      requires_ai_personalization: Boolean(o.requires_ai_personalization),
      recommended_front_end_offer: String(o.recommended_front_end_offer ?? ""),
    });
  }
  return out;
}

async function generateIdeasWithClaude(args: {
  clientId: string;
  industryVertical: string | null;
  clientName: string;
  strategyName: string;
  lane: Record<string, unknown>;
  websiteSummary: string;
  extracted: Record<string, unknown>;
}): Promise<IdeaRow[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const system = `You are a cold outbound campaign strategist for a B2B agency. You produce structured campaign idea lists. Output is creative / strategic work.

${JSON_SHAPE}

${checklistText()}`;

  const user = `Client: ${args.clientName}
Strategy: ${args.strategyName}

ICP lane (JSON):
${JSON.stringify(args.lane, null, 2)}

Website summary (may be empty):
${args.websiteSummary || "(none)"}

Website extracted JSON (from earlier bulk analysis; may be empty):
${JSON.stringify(args.extracted, null, 2)}

Generate the JSON array only.`;

  const raw = await callClaude({
    system,
    user,
    maxTokens: 8192,
    grounding: { clientId: args.clientId, industryVertical: args.industryVertical },
  });

  const parsed = parseJsonFromClaude<unknown>(raw);
  return normalizeIdeas(parsed);
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
      .select("id, name, industry_vertical")
      .eq("id", sRes.data.client_id)
      .maybeSingle();

    const websiteSummary = (analysisRes.data as { summary?: string } | null)?.summary ?? "";
    const extracted = (analysisRes.data as { extracted?: Record<string, unknown> } | null)?.extracted ?? {};

    const ideas = await generateIdeasWithClaude({
      clientId: sRes.data.client_id,
      industryVertical: clientRow?.industry_vertical ?? null,
      clientName: clientRow?.name ?? "Client",
      strategyName: sRes.data.name,
      lane: (laneRes.data as Record<string, unknown>) ?? {},
      websiteSummary,
      extracted: extracted && typeof extracted === "object" ? extracted : {},
    });

    if (ideas.length < 15) {
      return NextResponse.json(
        { error: `Claude returned only ${ideas.length} idea(s); expected at least 15.` },
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

    const rows = ideas.slice(0, 40).map((i) => ({
      strategy_id: strategyId,
      lane_id,
      name: i.name.slice(0, 200),
      targeting_level: i.targeting_level,
      list_filters: i.list_filters,
      ai_strategy: i.ai_strategy,
      value_prop: i.value_prop,
      overview: i.overview,
      requires_ai_personalization: i.requires_ai_personalization,
      recommended_front_end_offer: i.recommended_front_end_offer,
      meta: { generator: "claude-sonnet", checklist: "v1" },
      status: "active",
    }));

    const { data, error } = await supabase.from("strategy_lane_campaign_ideas").insert(rows).select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ideas: data ?? [] }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
