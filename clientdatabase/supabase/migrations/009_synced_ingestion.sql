-- Central data ingestion: synced_* tables (ecosystem apps → single warehouse for analysis)
-- Does not modify existing clients/campaigns/leads tables.

-- ---------------------------------------------------------------------------
-- synced_clients
-- ---------------------------------------------------------------------------
CREATE TABLE synced_clients (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app            TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    unified_client_id     UUID,
    name                  TEXT NOT NULL,
    data                  JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT synced_clients_source_unique UNIQUE (source_app, source_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_clients_unified
    ON synced_clients (unified_client_id) WHERE unified_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_synced_clients_source_app ON synced_clients (source_app);

-- ---------------------------------------------------------------------------
-- synced_campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE synced_campaigns (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app            TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    unified_client_id     UUID,
    name                  TEXT NOT NULL DEFAULT '',
    status                TEXT,
    data                  JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT synced_campaigns_source_unique UNIQUE (source_app, source_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_campaigns_unified
    ON synced_campaigns (unified_client_id) WHERE unified_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_synced_campaigns_source_app ON synced_campaigns (source_app);

-- ---------------------------------------------------------------------------
-- synced_leads
-- ---------------------------------------------------------------------------
CREATE TABLE synced_leads (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app            TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    unified_client_id     UUID,
    email                 TEXT,
    company               TEXT,
    data                  JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT synced_leads_source_unique UNIQUE (source_app, source_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_leads_unified
    ON synced_leads (unified_client_id) WHERE unified_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_synced_leads_email_lower ON synced_leads (lower(trim(email)));

-- ---------------------------------------------------------------------------
-- synced_replies (no updated_at)
-- ---------------------------------------------------------------------------
CREATE TABLE synced_replies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app            TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    unified_client_id     UUID,
    lead_email            TEXT,
    classification        TEXT,
    reply_text            TEXT,
    data                  JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT synced_replies_source_unique UNIQUE (source_app, source_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_replies_unified
    ON synced_replies (unified_client_id) WHERE unified_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_synced_replies_lead_email_lower ON synced_replies (lower(trim(lead_email)));

-- ---------------------------------------------------------------------------
-- synced_client_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE synced_client_profiles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app            TEXT NOT NULL,
    source_id             TEXT NOT NULL,
    unified_client_id     UUID,
    icp                   JSONB NOT NULL DEFAULT '{}',
    case_studies          JSONB NOT NULL DEFAULT '{}',
    offer                 JSONB NOT NULL DEFAULT '{}',
    positioning           JSONB NOT NULL DEFAULT '{}',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT synced_client_profiles_source_unique UNIQUE (source_app, source_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_client_profiles_unified
    ON synced_client_profiles (unified_client_id) WHERE unified_client_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS (service role — same pattern as warehouse tables)
-- ---------------------------------------------------------------------------
ALTER TABLE synced_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON synced_clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON synced_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON synced_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON synced_replies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON synced_client_profiles FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- updated_at triggers (tables that have updated_at)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS synced_clients_updated_at ON synced_clients;
CREATE TRIGGER synced_clients_updated_at
    BEFORE UPDATE ON synced_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS synced_campaigns_updated_at ON synced_campaigns;
CREATE TRIGGER synced_campaigns_updated_at
    BEFORE UPDATE ON synced_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS synced_leads_updated_at ON synced_leads;
CREATE TRIGGER synced_leads_updated_at
    BEFORE UPDATE ON synced_leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS synced_client_profiles_updated_at ON synced_client_profiles;
CREATE TRIGGER synced_client_profiles_updated_at
    BEFORE UPDATE ON synced_client_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE synced_clients IS 'Ingested client rows from ecosystem apps (reply handler, portal, etc.).';
COMMENT ON TABLE synced_campaigns IS 'Ingested campaign rows from ecosystem apps.';
COMMENT ON TABLE synced_leads IS 'Ingested lead rows from ecosystem apps.';
COMMENT ON TABLE synced_replies IS 'Ingested reply rows from ecosystem apps.';
COMMENT ON TABLE synced_client_profiles IS 'ICP / offers / positioning blobs from client portal.';
