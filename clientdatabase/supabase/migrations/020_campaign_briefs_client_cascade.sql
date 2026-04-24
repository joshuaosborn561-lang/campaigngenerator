-- Deleting a client should remove their campaign briefs. Prior FK was ON DELETE SET NULL.
-- Drop the default FK name and re-add with CASCADE (name matches typical Postgres default).

ALTER TABLE campaign_briefs DROP CONSTRAINT IF EXISTS campaign_briefs_client_id_fkey;

ALTER TABLE campaign_briefs
  ADD CONSTRAINT campaign_briefs_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
