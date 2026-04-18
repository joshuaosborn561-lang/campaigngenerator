-- Migration 002: Unified contacts table + HeyReach support
-- Contacts are deduplicated by email across all sources (SmartLead, HeyReach, manual)
-- Filterable by all the same fields you'd use in Apollo

-- ============================================================
-- Add HeyReach API key to clients
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS heyreach_api_key TEXT;

-- ============================================================
-- Add source platform to campaigns (smartlead vs heyreach)
-- ============================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source_platform TEXT DEFAULT 'smartlead';
-- Make smartlead_campaign_id nullable for heyreach campaigns
ALTER TABLE campaigns ALTER COLUMN smartlead_campaign_id DROP NOT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS heyreach_campaign_id BIGINT;

-- ============================================================
-- CONTACTS — unified, deduplicated by email
-- Apollo-style filterable fields
-- ============================================================
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    email TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT GENERATED ALWAYS AS (
        COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
    ) STORED,

    -- Professional info (Apollo-style)
    title TEXT,                          -- "VP of Sales", "CTO", "Director of IT"
    seniority TEXT,                      -- c-suite, vp, director, manager, senior, entry
    department TEXT,                     -- sales, marketing, engineering, operations, it, hr, finance, executive
    linkedin_url TEXT,

    -- Company info
    company_name TEXT,
    company_domain TEXT,
    company_industry TEXT,               -- SaaS, MSP, Cybersecurity, Healthcare IT, etc.
    company_size TEXT,                   -- 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5000+
    company_revenue TEXT,                -- <1M, 1M-10M, 10M-50M, 50M-100M, 100M-500M, 500M+
    company_linkedin_url TEXT,

    -- Location
    city TEXT,
    state TEXT,
    country TEXT,
    timezone TEXT,

    -- Contact metadata
    phone TEXT,
    tags TEXT[],                          -- custom tags for segmentation
    custom_fields JSONB DEFAULT '{}',    -- flexible extra data

    -- Source tracking
    source_platform TEXT NOT NULL,        -- smartlead, heyreach, manual, csv
    source_list TEXT,                     -- which list they came from
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Engagement summary (rolled up from leads table)
    total_campaigns INT DEFAULT 0,
    total_emails_sent INT DEFAULT 0,
    total_opens INT DEFAULT 0,
    total_replies INT DEFAULT 0,
    last_contacted_at TIMESTAMPTZ,
    last_replied_at TIMESTAMPTZ,
    overall_status TEXT DEFAULT 'new',    -- new, contacted, engaged, replied, meeting_booked, customer, do_not_contact
    meeting_booked BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apollo-style search and filter indexes
CREATE INDEX idx_contacts_email ON contacts (email);
CREATE INDEX idx_contacts_name ON contacts (full_name);
CREATE INDEX idx_contacts_first_name ON contacts (first_name);
CREATE INDEX idx_contacts_last_name ON contacts (last_name);
CREATE INDEX idx_contacts_title ON contacts (title);
CREATE INDEX idx_contacts_seniority ON contacts (seniority);
CREATE INDEX idx_contacts_department ON contacts (department);
CREATE INDEX idx_contacts_company ON contacts (company_name);
CREATE INDEX idx_contacts_company_industry ON contacts (company_industry);
CREATE INDEX idx_contacts_company_size ON contacts (company_size);
CREATE INDEX idx_contacts_city ON contacts (city);
CREATE INDEX idx_contacts_state ON contacts (state);
CREATE INDEX idx_contacts_country ON contacts (country);
CREATE INDEX idx_contacts_source ON contacts (source_platform);
CREATE INDEX idx_contacts_status ON contacts (overall_status);
CREATE INDEX idx_contacts_meeting ON contacts (meeting_booked) WHERE meeting_booked = true;
CREATE INDEX idx_contacts_last_contacted ON contacts (last_contacted_at DESC NULLS LAST);
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags);

-- Full text search on name, title, company
CREATE INDEX idx_contacts_fts ON contacts USING GIN (
    to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(title, '') || ' ' || COALESCE(company_name, ''))
);

-- ============================================================
-- Link table: which contacts are in which campaigns
-- ============================================================
CREATE TABLE contact_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    status TEXT,                          -- active, paused, completed, replied
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(contact_id, campaign_id)
);

CREATE INDEX idx_cc_contact ON contact_campaigns (contact_id);
CREATE INDEX idx_cc_campaign ON contact_campaigns (campaign_id);

-- ============================================================
-- RLS + policies
-- ============================================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON contact_campaigns FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- View: Contact search (Apollo-style)
-- ============================================================
CREATE VIEW contact_search AS
SELECT
    c.id,
    c.email,
    c.first_name,
    c.last_name,
    c.full_name,
    c.title,
    c.seniority,
    c.department,
    c.linkedin_url,
    c.company_name,
    c.company_domain,
    c.company_industry,
    c.company_size,
    c.company_revenue,
    c.city,
    c.state,
    c.country,
    c.tags,
    c.source_platform,
    c.source_list,
    c.total_campaigns,
    c.total_emails_sent,
    c.total_replies,
    c.last_contacted_at,
    c.last_replied_at,
    c.overall_status,
    c.meeting_booked,
    c.created_at
FROM contacts c;
