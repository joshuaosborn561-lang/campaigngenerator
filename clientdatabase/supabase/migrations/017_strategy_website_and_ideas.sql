-- Client onboarding enhancements:
-- - store website analysis artifacts per strategy
-- - generate/store 15-25 campaign ideas per ICP lane
-- - optionally link a spawned brief to a chosen idea (spawn flow stays the same)

-- ============================================================
-- 1) Website analysis (per strategy)
-- ============================================================
CREATE TABLE IF NOT EXISTS strategy_website_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES client_strategies(id) ON DELETE CASCADE,
  website_url TEXT NOT NULL,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE strategy_website_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON strategy_website_analysis;
CREATE POLICY "Service role full access" ON strategy_website_analysis FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategy_site_analysis_strategy ON strategy_website_analysis(strategy_id);

DROP TRIGGER IF EXISTS strategy_website_analysis_updated_at ON strategy_website_analysis;
CREATE TRIGGER strategy_website_analysis_updated_at
  BEFORE UPDATE ON strategy_website_analysis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Keep only one "current" analysis row per strategy+url.
CREATE UNIQUE INDEX IF NOT EXISTS uq_strategy_site_analysis_strategy_url
  ON strategy_website_analysis(strategy_id, website_url);

-- ============================================================
-- 2) Campaign ideas (per strategy lane)
-- ============================================================
CREATE TABLE IF NOT EXISTS strategy_lane_campaign_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES client_strategies(id) ON DELETE CASCADE,
  lane_id UUID NOT NULL REFERENCES strategy_icp_lanes(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  targeting_level TEXT NOT NULL DEFAULT 'focused' CHECK (targeting_level IN ('broad','focused','niche')),
  list_filters TEXT NOT NULL DEFAULT '',
  ai_strategy TEXT NOT NULL DEFAULT '',
  value_prop TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',

  requires_ai_personalization BOOLEAN NOT NULL DEFAULT true,
  recommended_front_end_offer TEXT,

  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE strategy_lane_campaign_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON strategy_lane_campaign_ideas;
CREATE POLICY "Service role full access" ON strategy_lane_campaign_ideas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategy_lane_ideas_strategy ON strategy_lane_campaign_ideas(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_lane_ideas_lane ON strategy_lane_campaign_ideas(lane_id);
CREATE INDEX IF NOT EXISTS idx_strategy_lane_ideas_status ON strategy_lane_campaign_ideas(status);

DROP TRIGGER IF EXISTS strategy_lane_campaign_ideas_updated_at ON strategy_lane_campaign_ideas;
CREATE TRIGGER strategy_lane_campaign_ideas_updated_at
  BEFORE UPDATE ON strategy_lane_campaign_ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3) Link campaign briefs to a chosen idea (optional)
-- ============================================================
ALTER TABLE campaign_briefs
  ADD COLUMN IF NOT EXISTS strategy_campaign_idea_id UUID REFERENCES strategy_lane_campaign_ideas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategy_campaign_idea_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN campaign_briefs.strategy_campaign_idea_id IS 'Optional: the lane campaign idea chosen at spawn time.';
COMMENT ON COLUMN campaign_briefs.strategy_campaign_idea_snapshot IS 'Snapshot of idea fields used when spawning so historical briefs are stable.';

CREATE INDEX IF NOT EXISTS idx_briefs_campaign_idea ON campaign_briefs(strategy_campaign_idea_id);

