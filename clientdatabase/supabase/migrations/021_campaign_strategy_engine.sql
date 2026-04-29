-- Campaign Strategy Engine: structured ICP / objection / ideation / QA JSON on the brief
ALTER TABLE campaign_briefs
  ADD COLUMN IF NOT EXISTS campaign_strategy_engine JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN campaign_briefs.campaign_strategy_engine IS
  'Strategy engine artifacts: client_profile, objection_map, campaign_ideas, offer_scores, copy_qa (JSON).';
