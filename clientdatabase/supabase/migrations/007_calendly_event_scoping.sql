-- Calendly: distinguish agency-owned meetings vs client-attributed (mixed calendar / one webhook).

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
