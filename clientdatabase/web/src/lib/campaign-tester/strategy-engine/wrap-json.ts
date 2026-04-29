import type { CampaignStrategyEngineState } from "./types";

/** Merge partial updates into existing campaign_strategy_engine JSONB. */
export function mergeEngineState(
  prev: CampaignStrategyEngineState | null | undefined,
  patch: Partial<CampaignStrategyEngineState>
): CampaignStrategyEngineState {
  const base = prev ?? {};
  return {
    ...base,
    ...patch,
    campaign_ideas:
      patch.campaign_ideas !== undefined ? patch.campaign_ideas : base.campaign_ideas,
    offer_scores: patch.offer_scores !== undefined ? patch.offer_scores : base.offer_scores,
    objection_map: patch.objection_map !== undefined ? patch.objection_map : base.objection_map,
    client_profile: patch.client_profile !== undefined ? patch.client_profile : base.client_profile,
    copy_qa: patch.copy_qa !== undefined ? patch.copy_qa : base.copy_qa,
  };
}
