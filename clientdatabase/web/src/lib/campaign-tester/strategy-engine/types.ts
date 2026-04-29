/**
 * Campaign Strategy Engine — structured artifacts stored on `campaign_briefs.campaign_strategy_engine` (JSONB).
 * Inspired by outbound playbook workflows (ICP → objections → segments → offers → ideas → QA).
 */

export interface OfferScoreRow {
  offer_id: string;
  icp_specificity: number;
  pain_relevance: number;
  listability: number;
  offer_strength: number;
  reply_likelihood: number;
  total: number;
  pass: boolean;
  notes: string;
}

export interface CampaignStrategyEngineState {
  client_profile?: Record<string, unknown>;
  objection_map?: Record<string, unknown>;
  campaign_ideas?: {
    ideas: Record<string, unknown>[];
    generated_at?: string;
  };
  offer_scores?: OfferScoreRow[];
  copy_qa?: Record<string, unknown>;
}
