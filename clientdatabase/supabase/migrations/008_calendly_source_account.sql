-- Which Calendly account (yours vs a client's) sent the webhook — for separate orgs / subscriptions.

ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS source_organization_uri TEXT;
ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS source_user_uri TEXT;

COMMENT ON COLUMN calendly_events.source_organization_uri IS 'Calendly organization URI from webhook payload — used with CALENDLY_ACCOUNT_MAP.';
COMMENT ON COLUMN calendly_events.source_user_uri IS 'Calendly user URI when present — fallback key for CALENDLY_ACCOUNT_MAP.';

CREATE INDEX IF NOT EXISTS idx_calendly_source_org ON calendly_events (source_organization_uri)
    WHERE source_organization_uri IS NOT NULL;
