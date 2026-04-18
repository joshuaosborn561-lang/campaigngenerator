-- =============================================================================
-- Calendly migrations 006 + 007 + 008 (bundled for Supabase SQL Editor)
-- Run once: Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run: IF NOT EXISTS / IF NOT EXISTS columns / DROP IF EXISTS policy
-- =============================================================================

-- 006_calendly_events.sql
CREATE TABLE IF NOT EXISTS calendly_events (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitee_uri           TEXT UNIQUE,
    event_uri             TEXT,
    invitee_email         TEXT NOT NULL,
    invitee_name          TEXT,
    event_name            TEXT,
    status                TEXT NOT NULL DEFAULT 'active',
    event_start_at        TIMESTAMPTZ,
    event_end_at          TIMESTAMPTZ,
    canceled_at           TIMESTAMPTZ,
    calendly_event_type   TEXT,
    raw_payload           JSONB NOT NULL DEFAULT '{}',
    contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
    lead_id               UUID REFERENCES leads(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendly_events_email_lower
    ON calendly_events (lower(trim(invitee_email)));
CREATE INDEX IF NOT EXISTS idx_calendly_events_start
    ON calendly_events (event_start_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_calendly_events_status
    ON calendly_events (status);
CREATE INDEX IF NOT EXISTS idx_calendly_events_contact
    ON calendly_events (contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE calendly_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON calendly_events;
CREATE POLICY "Service role full access" ON calendly_events FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS calendly_events_updated_at ON calendly_events;
CREATE TRIGGER calendly_events_updated_at
    BEFORE UPDATE ON calendly_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE calendly_events IS 'Meetings booked via Calendly webhooks — source of truth vs platform-reported meeting flags.';

-- 007_calendly_event_scoping.sql
ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS meeting_scope TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS inferred_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS attribution_rule TEXT;

COMMENT ON COLUMN calendly_events.meeting_scope IS 'agency = invitee matched CALENDLY_AGENCY_* env rules; client = single dominant client inferred from contact campaigns; mixed = contact tied to multiple clients; unknown = no contact or no campaigns.';
COMMENT ON COLUMN calendly_events.inferred_client_id IS 'When meeting_scope=client, the warehouse client this meeting is attributed to.';
COMMENT ON COLUMN calendly_events.attribution_rule IS 'How meeting_scope was decided (machine-readable).';

CREATE INDEX IF NOT EXISTS idx_calendly_inferred_client
    ON calendly_events (inferred_client_id)
    WHERE inferred_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendly_meeting_scope
    ON calendly_events (meeting_scope);

-- 008_calendly_source_account.sql
ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS source_organization_uri TEXT;
ALTER TABLE calendly_events
    ADD COLUMN IF NOT EXISTS source_user_uri TEXT;

COMMENT ON COLUMN calendly_events.source_organization_uri IS 'Calendly organization URI from webhook payload — used with CALENDLY_ACCOUNT_MAP.';
COMMENT ON COLUMN calendly_events.source_user_uri IS 'Calendly user URI when present — fallback key for CALENDLY_ACCOUNT_MAP.';

CREATE INDEX IF NOT EXISTS idx_calendly_source_org ON calendly_events (source_organization_uri)
    WHERE source_organization_uri IS NOT NULL;
