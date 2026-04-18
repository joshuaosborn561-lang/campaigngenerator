-- Calendly-verified meetings (Goal 6): webhook-ingested scheduled events linked to contacts/leads.

CREATE TABLE IF NOT EXISTS calendly_events (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitee_uri           TEXT UNIQUE,
    event_uri             TEXT,
    invitee_email         TEXT NOT NULL,
    invitee_name          TEXT,
    event_name            TEXT,
    status                TEXT NOT NULL DEFAULT 'active', -- active | canceled
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
