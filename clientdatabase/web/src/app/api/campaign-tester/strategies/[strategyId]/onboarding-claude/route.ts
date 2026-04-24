import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callClaudeMulti, parseJsonFromClaude, type ClaudeMessageParam } from "@/lib/campaign-tester/claude-client";

type Ctx = { params: Promise<{ strategyId: string }> };

type Mode = "icp" | "lanes" | "offers" | "finalize_lanes" | "finalize_offers";

const LANE_JSON = `Return ONLY a JSON object (no markdown) with key "lanes" — an array of 2–6 objects, each with:
- name (string) — short segment name
- description (string) — who and firmographics
- titles (string[]) — target titles
- company_size (string) — e.g. "20-200 FTE"
- geography (string) — e.g. "US Mid-Atlantic" or "NA"
- industries (string[]) — can be empty
- signals (string[]) — technographic/hiring signals if any, else []`;

const OFFER_JSON = `Return ONLY a JSON object (no markdown) with key "offers" — an array of exactly 15 objects, each with:
- name (string) — angle label
- one_liner (string) — value in one line
- cta (string) — soft CTA
- rationale (string) — why this angle for this ICP (can be short)`;

function systemForMode(mode: Exclude<Mode, "finalize_lanes" | "finalize_offers">, clientName: string): string {
  const base = `You are the built-in B2B outbound strategist in the SalesGlider client onboarding flow (not a separate app). You are trained on the same playbooks the rest of this product uses, plus the client's site/context below. Be concise, practical, and collaborative. Ask clarifying questions when needed. This is a real back-and-forth: refine based on the user's latest message.`;
  if (mode === "icp") {
    return `${base}

Focus: who is the real decision maker / economic buyer, blockers, and which titles to target. Use the context below. When the user is satisfied, summarize the agreed ICP hypothesis clearly at the end of your reply.`;
  }
  if (mode === "lanes") {
    return `${base}

Focus: ICP **segments** (firmographics) — e.g. company size bands, geo, industry slices, and how titles differ per slice. Suggest 2–4 segment options and iterate until the user says they're happy. When suggesting concrete segments, you may list them as bullet points.`;
  }
  return `${base}

Focus: **offer angles** and hooks (about 15 directions). We will later save exactly 15 named offers. Start by proposing a first pass of angles; the user will give feedback, merge, remove, or ask for rewrites. Include risk-reversal and proof where relevant.`;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { strategyId } = await ctx.params;
    const body = await req.json();
    const mode = body.mode as Mode;
    const rawMessages = body.messages;
    if (!mode || !["icp", "lanes", "offers", "finalize_lanes", "finalize_offers"].includes(mode)) {
      return NextResponse.json({ error: "mode must be icp | lanes | offers | finalize_lanes | finalize_offers" }, { status: 400 });
    }
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }
    const messages: ClaudeMessageParam[] = rawMessages
      .filter((m: unknown) => {
        if (!m || typeof m !== "object") return false;
        const r = (m as { role?: string; content?: unknown }).role;
        const c = (m as { content?: unknown }).content;
        return (r === "user" || r === "assistant") && typeof c === "string";
      })
      .map((m) => {
        const o = m as { role: string; content: string };
        return {
          role: o.role as "user" | "assistant",
          content: String(o.content).slice(0, 120000),
        };
      });
    if (messages.length === 0) {
      return NextResponse.json({ error: "no valid messages" }, { status: 400 });
    }
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") {
        return NextResponse.json({ error: "invalid message role" }, { status: 400 });
      }
    }
    if (messages[messages.length - 1]!.role !== "user") {
      return NextResponse.json({ error: "last message must be from user" }, { status: 400 });
    }

    const sRes = await supabase
      .from("client_strategies")
      .select("id, client_id, name, what_they_do, core_pain, measurable_outcome")
      .eq("id", strategyId)
      .maybeSingle();
    if (sRes.error) return NextResponse.json({ error: sRes.error.message }, { status: 500 });
    if (!sRes.data) return NextResponse.json({ error: "strategy not found" }, { status: 404 });

    const { data: clientRow } = await supabase
      .from("clients")
      .select("id, name, industry_vertical, notes")
      .eq("id", sRes.data.client_id)
      .maybeSingle();

    const analysisRes = await supabase
      .from("strategy_website_analysis")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const websiteSummary = (analysisRes.data as { summary?: string } | null)?.summary ?? "";
    const extracted = (analysisRes.data as { extracted?: Record<string, unknown> } | null)?.extracted ?? {};

    const contextBlock = [
      `Client: ${clientRow?.name ?? "Unknown"}`,
      `Industry: ${clientRow?.industry_vertical ?? "(not set)"}`,
      clientRow?.notes ? `Notes: ${String(clientRow.notes).slice(0, 2000)}` : null,
      `Strategy: ${sRes.data.name}`,
      sRes.data.what_they_do ? `What they do: ${sRes.data.what_they_do}` : null,
      sRes.data.core_pain ? `Core pain: ${sRes.data.core_pain}` : null,
      sRes.data.measurable_outcome ? `Measurable outcome: ${sRes.data.measurable_outcome}` : null,
      websiteSummary ? `Website summary: ${websiteSummary}` : null,
      `Website extracted (JSON): ${JSON.stringify(extracted).slice(0, 8000)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const grounding = {
      clientId: sRes.data.client_id,
      industryVertical: clientRow?.industry_vertical ?? null,
    };

    if (mode === "finalize_lanes" || mode === "finalize_offers") {
      const finalSystem =
        mode === "finalize_lanes"
          ? `You are finalizing ICP lane rows for a database. The conversation has the agreed segments. ${LANE_JSON}
Use only what the user confirmed. If something is missing, infer conservatively from the chat. No prose outside JSON.`
          : `You are finalizing offer library rows. The conversation has the agreed 15 (or user-selected) offer angles. ${OFFER_JSON}
If fewer than 15 were chosen, invent strong additional angles consistent with the chat until there are exactly 15. No prose outside JSON.`;

      const finalUser = `Context for the client/strategy:\n${contextBlock}\n\n---\nConversation (most recent last):\n${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}`;

      const raw = await callClaudeMulti({
        system: finalSystem,
        messages: [{ role: "user", content: finalUser }],
        maxTokens: 8192,
        grounding,
      });
      const parsed = parseJsonFromClaude<Record<string, unknown>>(raw);
      if (mode === "finalize_lanes") {
        const lanesRaw = (parsed as { lanes?: unknown }).lanes;
        if (!Array.isArray(lanesRaw) || lanesRaw.length === 0) {
          return NextResponse.json({ error: "Claude did not return a valid lanes array" }, { status: 502 });
        }
        const replace = body.replace === true;
        if (replace) {
          const { error: delE } = await supabase.from("strategy_icp_lanes").delete().eq("strategy_id", strategyId);
          if (delE) return NextResponse.json({ error: delE.message }, { status: 500 });
        }
        const inserted: { id: string; name: string }[] = [];
        for (const item of lanesRaw) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          const name = String(o.name ?? "").trim();
          if (!name) continue;
          const row = {
            strategy_id: strategyId,
            name: name.slice(0, 200),
            description: typeof o.description === "string" ? o.description : null,
            titles: Array.isArray(o.titles) ? o.titles.map((x) => String(x)) : [],
            company_size: typeof o.company_size === "string" ? o.company_size : null,
            geography: typeof o.geography === "string" ? o.geography : null,
            industries: Array.isArray(o.industries) ? o.industries.map((x) => String(x)) : [],
            signals: Array.isArray(o.signals) ? o.signals.map((x) => String(x)) : [],
            seniority: [] as string[],
            departments: [] as string[],
            exclusions: [] as string[],
            status: "active",
          };
          const { data, error: insE } = await supabase
            .from("strategy_icp_lanes")
            .insert(row)
            .select("id, name")
            .single();
          if (insE) {
            if (insE.message.includes("unique") || insE.code === "23505") {
              const { data: ex } = await supabase
                .from("strategy_icp_lanes")
                .select("id, name")
                .eq("strategy_id", strategyId)
                .eq("name", row.name)
                .maybeSingle();
              if (ex) inserted.push(ex);
            } else {
              return NextResponse.json({ error: insE.message }, { status: 500 });
            }
          } else if (data) {
            inserted.push(data);
          }
        }
        return NextResponse.json({ ok: true, saved_lanes: inserted.length, lanes: inserted });
      }
      // finalize_offers
      const offersRaw = (parsed as { offers?: unknown }).offers;
      if (!Array.isArray(offersRaw) || offersRaw.length < 1) {
        return NextResponse.json({ error: "Claude did not return a valid offers array" }, { status: 502 });
      }
      const offerSlice = offersRaw.slice(0, 20);
      if (body.replace === true) {
        const { error: delE } = await supabase.from("strategy_offers").delete().eq("strategy_id", strategyId);
        if (delE) return NextResponse.json({ error: delE.message }, { status: 500 });
      }
      const inserted: { id: string; name: string }[] = [];
      for (const item of offerSlice) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const name = String(o.name ?? "").trim();
        const one_liner = String(o.one_liner ?? "").trim();
        const cta = String(o.cta ?? "Reply if interested").trim();
        if (!name || !one_liner) continue;
        const { data, error: insE } = await supabase
          .from("strategy_offers")
          .insert({
            strategy_id: strategyId,
            name: name.slice(0, 200),
            one_liner: one_liner.slice(0, 2000),
            cta: cta.slice(0, 2000),
            rationale: typeof o.rationale === "string" ? o.rationale : null,
            status: "active",
          })
          .select("id, name")
          .single();
        if (insE) {
          if (insE.message.includes("unique") || insE.code === "23505") {
            const { data: ex } = await supabase
              .from("strategy_offers")
              .select("id, name")
              .eq("strategy_id", strategyId)
              .eq("name", name.slice(0, 200))
              .maybeSingle();
            if (ex) inserted.push(ex);
          } else {
            return NextResponse.json({ error: insE.message }, { status: 500 });
          }
        } else if (data) {
          inserted.push(data);
        }
      }
      return NextResponse.json({
        ok: true,
        saved_offers: inserted.length,
        offers: inserted,
        offer_count: inserted.length,
        expected_fifteen: inserted.length < 15,
        hint:
          inserted.length < 15
            ? "If you need a full 15, continue the chat until Claude commits to 15 names, or ask it to return exactly 15 in the next turn and save again."
            : null,
      });
    }

    const firstUser = messages[0]!.role === "user" ? messages[0]!.content : "";
    const augmented: ClaudeMessageParam[] = [
      {
        role: "user",
        content: `Use this context in every reply (do not repeat it verbatim every time, but follow it):\n\n${contextBlock}\n\n---\n\n${firstUser}`,
      },
      ...messages.slice(1).map((m) => ({ role: m.role, content: m.content })),
    ];
    if (augmented[0]!.role !== "user") {
      return NextResponse.json({ error: "internal: first message" }, { status: 500 });
    }

    const system = systemForMode(mode, clientRow?.name ?? "Client");
    const reply = await callClaudeMulti({
      system,
      messages: augmented,
      maxTokens: mode === "offers" ? 4096 : 3072,
      grounding,
    });
    return NextResponse.json({ reply, mode });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
