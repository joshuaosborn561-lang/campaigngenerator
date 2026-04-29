import { supabase } from "@/lib/supabase";
import type { BriefRecord } from "@/lib/campaign-tester/brief-types";
import type { CampaignStrategyEngineState } from "./types";

export async function loadBriefForEngine(briefId: string): Promise<{
  brief: BriefRecord;
  engine: CampaignStrategyEngineState;
} | null> {
  const { data: briefRow, error } = await supabase
    .from("campaign_briefs")
    .select("*, clients (id, name, industry_vertical)")
    .eq("id", briefId)
    .maybeSingle();
  if (error || !briefRow) return null;
  const brief = briefRow as unknown as BriefRecord;
  const raw = (briefRow as { campaign_strategy_engine?: unknown }).campaign_strategy_engine;
  const engine =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as CampaignStrategyEngineState)
      : {};
  return { brief, engine };
}
