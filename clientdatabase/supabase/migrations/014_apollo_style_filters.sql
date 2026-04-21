-- Apollo / B2B database–style dimensions for filtering (stored when sync or enrichment provides them).
-- Engagement flags on leads for reply / unsubscribe / hostile outreach outcomes.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS technologies TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS funding_stage TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_function TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS hq_location TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS person_keywords TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS years_in_role TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS education_summary TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS buying_intent_topics TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS naics_or_industry_code TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_public_private TEXT;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_hostile_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN contacts.technologies IS 'Technologies used at account (Apollo-style), when known';
COMMENT ON COLUMN contacts.funding_stage IS 'e.g. seed, series_a, series_b, public, bootstrapped';
COMMENT ON COLUMN contacts.job_function IS 'Broader function bucket vs department (e.g. Finance, Operations)';
COMMENT ON COLUMN contacts.hq_location IS 'Company headquarters region/city when distinct from person location';
COMMENT ON COLUMN contacts.person_keywords IS 'Skills/topics on the person profile when known';
COMMENT ON COLUMN contacts.buying_intent_topics IS 'Intent or surge topics when enrichment provides them';

ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_replied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_hostile BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN leads.has_replied IS 'True when lead has replied in-sequence (from platform category/status)';
COMMENT ON COLUMN leads.is_unsubscribed IS 'True when lead unsubscribed or marked unsubscribed';
COMMENT ON COLUMN leads.is_hostile IS 'True for strong negative: not interested, DNC, hostile reply sentiment';

CREATE INDEX IF NOT EXISTS idx_leads_has_replied ON leads (campaign_id) WHERE has_replied = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_unsub ON leads (campaign_id) WHERE is_unsubscribed = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_hostile ON leads (campaign_id) WHERE is_hostile = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_unsub ON contacts (is_unsubscribed) WHERE is_unsubscribed = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_hostile ON contacts (is_hostile_opt_out) WHERE is_hostile_opt_out = TRUE;
