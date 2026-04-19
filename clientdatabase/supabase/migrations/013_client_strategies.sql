-- Client Strategy → Campaign Generator
--
-- Adds client-level strategy objects (truth pack, offer library, ICP lanes)
-- so operators don't redo Modules 1–4 for every campaign.
--
-- Model:
-- - client_strategies: one (or more) strategy per client
-- - strategy_offers: reusable offer library entries
-- - strategy_icp_lanes: reusable ICP lane definitions
-- - campaign_briefs: references a strategy + chosen lane + chosen offer when spawned

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1) Client strategies
-- ============================================================
CREATE TABLE IF NOT EXISTS client_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,

  -- Minimum "truth pack"
  what_they_do TEXT,
  measurable_outcome TEXT,
  timeline_claim TEXT,
  named_results TEXT,
  core_pain TEXT,

  -- Constraints / assets / notes
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_assets JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, name)
);

ALTER TABLE client_strategies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON client_strategies;
CREATE POLICY "Service role full access" ON client_strategies FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_client_strategies_client ON client_strategies(client_id);

DROP TRIGGER IF EXISTS client_strategies_updated_at ON client_strategies;
CREATE TRIGGER client_strategies_updated_at
  BEFORE UPDATE ON client_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2) Offer library (per strategy)
-- ============================================================
CREATE TABLE IF NOT EXISTS strategy_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES client_strategies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  one_liner TEXT NOT NULL,
  cta TEXT NOT NULL,
  rationale TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, name)
);

ALTER TABLE strategy_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON strategy_offers;
CREATE POLICY "Service role full access" ON strategy_offers FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategy_offers_strategy ON strategy_offers(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_offers_tags ON strategy_offers USING GIN (tags);

DROP TRIGGER IF EXISTS strategy_offers_updated_at ON strategy_offers;
CREATE TRIGGER strategy_offers_updated_at
  BEFORE UPDATE ON strategy_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3) ICP lanes (per strategy)
-- ============================================================
CREATE TABLE IF NOT EXISTS strategy_icp_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES client_strategies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Targeting definition
  titles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  seniority TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  departments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  industries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  company_size TEXT,
  geography TEXT,
  exclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (strategy_id, name)
);

ALTER TABLE strategy_icp_lanes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON strategy_icp_lanes;
CREATE POLICY "Service role full access" ON strategy_icp_lanes FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategy_lanes_strategy ON strategy_icp_lanes(strategy_id);

DROP TRIGGER IF EXISTS strategy_icp_lanes_updated_at ON strategy_icp_lanes;
CREATE TRIGGER strategy_icp_lanes_updated_at
  BEFORE UPDATE ON strategy_icp_lanes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4) Link campaign briefs to strategy/lane/offer
-- ============================================================
ALTER TABLE campaign_briefs
  ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES client_strategies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategy_lane_id UUID REFERENCES strategy_icp_lanes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategy_offer_id UUID REFERENCES strategy_offers(id) ON DELETE SET NULL;

COMMENT ON COLUMN campaign_briefs.strategy_id IS 'Client-level strategy this campaign was spawned from.';
COMMENT ON COLUMN campaign_briefs.strategy_lane_id IS 'ICP lane chosen for this campaign.';
COMMENT ON COLUMN campaign_briefs.strategy_offer_id IS 'Offer chosen for this campaign.';

CREATE INDEX IF NOT EXISTS idx_briefs_strategy ON campaign_briefs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_briefs_lane ON campaign_briefs(strategy_lane_id);
CREATE INDEX IF NOT EXISTS idx_briefs_offer ON campaign_briefs(strategy_offer_id);

