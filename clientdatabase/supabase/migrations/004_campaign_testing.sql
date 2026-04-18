-- Migration 004: Campaign Testing Machine
--
-- Adds the schema that backs the 6-test Cold Email Campaign Testing Wizard.
--
-- Three things land here:
--   1. Extra granular variable columns on `campaigns` so past campaigns can
--      serve as benchmarks for the wizard (match on industry + ICP size +
--      offer_type + play + lead_source).
--   2. A `campaign_briefs` table — one row per "new campaign I'm planning".
--      Captures ICP, offer, available assets, available plays, etc.
--   3. A `test_runs` table — one row per completed test (6 rows per finished
--      brief). Records the variant chosen, the generated copy/segmentation,
--      the target success metric, and optionally a link to the live campaign
--      that was launched off the back of it.

-- ============================================================
-- 1. Extra variable columns on the existing `campaigns` table.
--    All nullable — existing rows from SmartLead/HeyReach sync
--    won't have them filled in.
-- ============================================================
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS lead_source       TEXT,
    ADD COLUMN IF NOT EXISTS segmentation_tier TEXT,
    ADD COLUMN IF NOT EXISTS play_used         TEXT,
    ADD COLUMN IF NOT EXISTS offer_framing     TEXT,
    ADD COLUMN IF NOT EXISTS cta_type          TEXT,
    ADD COLUMN IF NOT EXISTS ps_line           TEXT,
    ADD COLUMN IF NOT EXISTS sequence_length   TEXT,
    ADD COLUMN IF NOT EXISTS icp_job_title     TEXT,
    ADD COLUMN IF NOT EXISTS icp_company_size  TEXT,
    ADD COLUMN IF NOT EXISTS icp_geography     TEXT,
    ADD COLUMN IF NOT EXISTS test_phase        INT,
    ADD COLUMN IF NOT EXISTS winner            BOOLEAN;

-- Generated column: meetings per 500 emails sent. This is the north-star
-- number for Test 6 ("sequence structure & multichannel") and also the
-- metric the diagnostic view uses to flag "5000+ emails per booking" cases.
DO $$
BEGIN
    ALTER TABLE campaigns
        ADD COLUMN meetings_per_500 NUMERIC
        GENERATED ALWAYS AS (
            CASE WHEN send_volume > 0
                 THEN (meetings_booked::NUMERIC / send_volume) * 500
                 ELSE NULL END
        ) STORED;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Benchmark queries hit these columns constantly — indexing the common
-- filter combinations pays for itself even on a small table.
CREATE INDEX IF NOT EXISTS campaigns_benchmark_idx
    ON campaigns (target_industry, icp_company_size, offer_type, play_used);

-- ============================================================
-- 2. campaign_briefs — one row per "new campaign I'm planning"
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_briefs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,
    name                  TEXT NOT NULL,

    -- ICP
    icp_job_title         TEXT,
    icp_company_size      TEXT,
    icp_geography         TEXT,
    target_industry       TEXT,

    -- Offer
    offer_description     TEXT,
    offer_type_hint       TEXT,  -- optional first guess; user picks real one in Test 2

    -- JSON blobs so we don't need a migration every time a new play/asset
    -- gets added to the knowledge base.
    available_assets      JSONB DEFAULT '{}'::jsonb,
    -- {competitor_data: bool, hiring_signals: bool, tech_stack_data: bool,
    --  case_studies: bool, named_clients: bool, social_proof: bool, ...}

    infrastructure_status JSONB DEFAULT '{}'::jsonb,
    -- {dns_verified: bool, warmup_complete: bool, list_verified: bool, ...}

    available_plays       TEXT[] DEFAULT ARRAY[]::TEXT[],
    -- subset of the knowledge base Test 4 play options

    status                TEXT DEFAULT 'in_progress'
                              CHECK (status IN ('in_progress', 'complete', 'abandoned')),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_briefs_client_idx ON campaign_briefs(client_id);
CREATE INDEX IF NOT EXISTS campaign_briefs_status_idx ON campaign_briefs(status);

-- ============================================================
-- 3. test_runs — one row per completed test per brief
-- ============================================================
CREATE TABLE IF NOT EXISTS test_runs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_id          UUID NOT NULL REFERENCES campaign_briefs(id) ON DELETE CASCADE,
    test_number       INT  NOT NULL CHECK (test_number BETWEEN 1 AND 6),
    variable_tested   TEXT NOT NULL,   -- e.g. "offer_type", "play_used"
    variant_chosen    TEXT NOT NULL,   -- e.g. "The Audit", "competitor mention"
    target_metric     TEXT,            -- e.g. "positive_reply_rate > 1%"

    -- Free-form JSON for the generated output (subject, body, segmentation
    -- criteria, sequence definition, etc.). Each test's route populates
    -- this differently.
    generated_output  JSONB,

    -- Optional: the live campaign that was launched off the back of this
    -- test_run. Lets the diagnostic view pull real send metrics later.
    campaign_id       UUID REFERENCES campaigns(id) ON DELETE SET NULL,

    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (brief_id, test_number)
);

CREATE INDEX IF NOT EXISTS test_runs_brief_idx ON test_runs(brief_id);

-- ============================================================
-- 4. Trigger: bump campaign_briefs.updated_at on any write.
-- ============================================================
CREATE OR REPLACE FUNCTION bump_campaign_briefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaign_briefs_updated_at ON campaign_briefs;
CREATE TRIGGER campaign_briefs_updated_at
    BEFORE UPDATE ON campaign_briefs
    FOR EACH ROW EXECUTE FUNCTION bump_campaign_briefs_updated_at();
