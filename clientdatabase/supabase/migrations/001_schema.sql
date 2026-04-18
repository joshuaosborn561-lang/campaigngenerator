-- Agency Intelligence Platform Schema
-- Designed for high-volume cold email analytics (500K+ emails/month)

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    industry_vertical TEXT,          -- e.g. "MSP", "Cybersecurity", "Staffing"
    smartlead_api_key TEXT,          -- encrypted at rest via Supabase vault
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_industry ON clients (industry_vertical);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    smartlead_campaign_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    status TEXT,                     -- active, paused, completed, archived
    campaign_start_date DATE,

    -- Target segment
    target_title TEXT,               -- e.g. "VP of Sales", "IT Director"
    target_company_size TEXT,        -- e.g. "50-200", "201-1000"
    target_industry TEXT,            -- industry of prospects, not client
    target_geography TEXT,

    -- AI-classified fields (populated during ingestion)
    offer_type TEXT,                 -- ROI-based, pain-based, social-proof, case-study, curiosity, direct-ask
    copy_patterns TEXT[],            -- array of detected patterns

    -- Aggregate stats (updated on sync)
    send_volume INT DEFAULT 0,
    open_rate NUMERIC(5,2),
    reply_rate NUMERIC(5,2),
    bounce_rate NUMERIC(5,2),
    positive_reply_count INT DEFAULT 0,
    negative_reply_count INT DEFAULT 0,
    referral_count INT DEFAULT 0,
    ooo_count INT DEFAULT 0,
    not_interested_count INT DEFAULT 0,
    meetings_booked INT DEFAULT 0,

    -- List source
    list_source TEXT,                -- where the leads came from

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(client_id, smartlead_campaign_id)
);

CREATE INDEX idx_campaigns_client ON campaigns (client_id);
CREATE INDEX idx_campaigns_offer_type ON campaigns (offer_type);
CREATE INDEX idx_campaigns_target_industry ON campaigns (target_industry);
CREATE INDEX idx_campaigns_target_title ON campaigns (target_title);
CREATE INDEX idx_campaigns_status ON campaigns (status);
CREATE INDEX idx_campaigns_start_date ON campaigns (campaign_start_date);
CREATE INDEX idx_campaigns_reply_rate ON campaigns (reply_rate DESC NULLS LAST);

-- ============================================================
-- SEQUENCE STEPS (email copy per step)
-- ============================================================
CREATE TABLE sequence_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    variant_label TEXT DEFAULT 'A', -- A/B variant
    subject_line TEXT,
    email_body TEXT,
    delay_days INT,

    -- Per-step stats
    open_rate NUMERIC(5,2),
    reply_rate NUMERIC(5,2),
    click_rate NUMERIC(5,2),

    -- AI classification
    offer_type TEXT,
    copy_patterns TEXT[],

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(campaign_id, step_number, variant_label)
);

CREATE INDEX idx_sequence_campaign ON sequence_steps (campaign_id);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    smartlead_lead_id BIGINT,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    title TEXT,
    industry TEXT,
    company_size TEXT,

    -- Engagement
    status TEXT,                     -- contacted, replied, bounced, unsubscribed
    category TEXT,                   -- interested, not_interested, ooo, referral, etc.
    reply_sentiment TEXT,            -- positive, negative, neutral
    meeting_booked BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(campaign_id, smartlead_lead_id)
);

CREATE INDEX idx_leads_campaign ON leads (campaign_id);
CREATE INDEX idx_leads_email ON leads (email);
CREATE INDEX idx_leads_category ON leads (category);
CREATE INDEX idx_leads_sentiment ON leads (reply_sentiment);
CREATE INDEX idx_leads_meeting ON leads (meeting_booked) WHERE meeting_booked = true;

-- ============================================================
-- EMAIL EVENTS (append-only log)
-- ============================================================
CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,        -- sent, opened, clicked, replied, bounced, unsubscribed
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    sequence_step INT,
    metadata JSONB,                  -- flexible field for reply text, bounce reason, etc.

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partitioning-ready index strategy for high-volume event table
CREATE INDEX idx_events_campaign ON email_events (campaign_id);
CREATE INDEX idx_events_type ON email_events (event_type);
CREATE INDEX idx_events_timestamp ON email_events (event_timestamp DESC);
CREATE INDEX idx_events_lead ON email_events (lead_id);
CREATE INDEX idx_events_campaign_type ON email_events (campaign_id, event_type);

-- ============================================================
-- SYNC LOG (track sync history)
-- ============================================================
CREATE TABLE sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL,         -- historical, nightly
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
    campaigns_synced INT DEFAULT 0,
    leads_synced INT DEFAULT 0,
    events_synced INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_log_client ON sync_log (client_id);
CREATE INDEX idx_sync_log_status ON sync_log (status);

-- ============================================================
-- VIEWS for common queries
-- ============================================================

-- Campaign performance summary
CREATE VIEW campaign_performance AS
SELECT
    c.id,
    c.name AS campaign_name,
    cl.name AS client_name,
    cl.industry_vertical,
    c.target_title,
    c.target_industry,
    c.target_company_size,
    c.offer_type,
    c.copy_patterns,
    c.send_volume,
    c.open_rate,
    c.reply_rate,
    c.bounce_rate,
    c.positive_reply_count,
    c.meetings_booked,
    c.list_source,
    c.campaign_start_date,
    c.status
FROM campaigns c
JOIN clients cl ON cl.id = c.client_id;

-- Subject line performance
CREATE VIEW subject_line_performance AS
SELECT
    ss.subject_line,
    cl.industry_vertical,
    c.target_title,
    c.offer_type,
    ss.open_rate,
    ss.reply_rate,
    c.name AS campaign_name,
    cl.name AS client_name
FROM sequence_steps ss
JOIN campaigns c ON c.id = ss.campaign_id
JOIN clients cl ON cl.id = c.client_id
WHERE ss.step_number = 1;

-- ============================================================
-- ROW LEVEL SECURITY (optional, for multi-user access)
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for sync service)
CREATE POLICY "Service role full access" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON sequence_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON email_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
