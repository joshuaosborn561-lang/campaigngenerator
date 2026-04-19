-- Intelligence MVP: additive columns for Gemini ICP + offer/variant classification,
-- lead enrichment, client sync toggle, and safe read-only SQL for /api/query.

-- ============================================================
-- Clients: optional pause for sync jobs
-- ============================================================
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN clients.sync_enabled IS 'When false, platform sync skips this client.';

-- ============================================================
-- Campaigns: inferred ICP (from lead samples) + content fingerprint
-- ============================================================
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS inferred_icp JSONB,
    ADD COLUMN IF NOT EXISTS inferred_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sequence_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS gemini_offer_profile JSONB;

COMMENT ON COLUMN campaigns.inferred_icp IS 'Gemini: ICP inferred from ~25 random leads + copy context.';
COMMENT ON COLUMN campaigns.gemini_offer_profile IS 'Gemini: wizard-style offer/copy signals aggregated across all sequence variants.';
COMMENT ON COLUMN campaigns.sequence_fingerprint IS 'Hash of all sequence step bodies; when it changes, ICP/offer re-inference may run.';

-- ============================================================
-- Sequence steps: per-variant offer angle (wizard-aligned)
-- ============================================================
ALTER TABLE sequence_steps
    ADD COLUMN IF NOT EXISTS inferred_offer_angle JSONB,
    ADD COLUMN IF NOT EXISTS inferred_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;

COMMENT ON COLUMN sequence_steps.inferred_offer_angle IS 'Gemini: incentive/offer structure for this step+variant.';
COMMENT ON COLUMN sequence_steps.content_fingerprint IS 'Hash of subject+body; when copy changes, re-infer.';

-- ============================================================
-- Leads: Apollo-style fields for better ICP + plain-English SQL
-- ============================================================
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS seniority TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS company_revenue TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN leads.seniority IS 'Heuristic from title (c-suite, vp, director, …).';
COMMENT ON COLUMN leads.department IS 'Heuristic from title (sales, hr, engineering, …).';
COMMENT ON COLUMN leads.city IS 'Prospect location when available from the platform.';
COMMENT ON COLUMN leads.state IS 'Prospect region/state when available.';
COMMENT ON COLUMN leads.country IS 'Prospect country when available.';

-- ============================================================
-- Read-only SQL execution (service role only — used by /api/query)
-- ============================================================
CREATE OR REPLACE FUNCTION exec_readonly(sql_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trimmed TEXT;
  lowered TEXT;
  wrapped TEXT;
  result JSONB;
BEGIN
  trimmed := trim(both from sql_text);
  trimmed := regexp_replace(trimmed, '\s*;\s*$', '');
  IF trimmed IS NULL OR trimmed = '' THEN
    RAISE EXCEPTION 'Empty SQL';
  END IF;

  IF position(';' IN trimmed) > 0 THEN
    RAISE EXCEPTION 'Multiple SQL statements are not allowed';
  END IF;

  lowered := lower(trimmed);
  IF NOT (left(lowered, 6) = 'select' OR left(lowered, 4) = 'with') THEN
    RAISE EXCEPTION 'Only SELECT or WITH … queries are allowed';
  END IF;

  IF trimmed ~* '(^|[^a-z_])(insert|update|delete|drop|alter|truncate|create|grant|revoke)([^a-z_]|$)' THEN
    RAISE EXCEPTION 'Only read-only SELECT queries are allowed';
  END IF;

  wrapped := 'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (' || trimmed || ') AS t';
  EXECUTE wrapped INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION exec_readonly(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_readonly(TEXT) TO service_role;

COMMENT ON FUNCTION exec_readonly(TEXT) IS 'Runs a single SELECT/WITH query and returns rows as JSONB array. For Agency Intelligence /api/query.';
