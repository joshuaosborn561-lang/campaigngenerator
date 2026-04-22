-- Engagement flags for filtering: replied, unsubscribed, hostile opt-out.
-- (Apollo-style enrichment dimensions were intentionally not added.)

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_hostile_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

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
