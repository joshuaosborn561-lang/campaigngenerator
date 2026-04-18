-- Revert 009_synced_ingestion.sql: remove ecosystem ingest warehouse tables.
-- Safe if tables were never created (IF EXISTS).

DROP TABLE IF EXISTS synced_client_profiles CASCADE;
DROP TABLE IF EXISTS synced_replies CASCADE;
DROP TABLE IF EXISTS synced_leads CASCADE;
DROP TABLE IF EXISTS synced_campaigns CASCADE;
DROP TABLE IF EXISTS synced_clients CASCADE;
