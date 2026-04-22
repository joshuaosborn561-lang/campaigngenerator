-- If migration 014_apollo_style_filters was applied earlier, remove those columns.
-- Safe to run on fresh DBs (IF EXISTS).

ALTER TABLE contacts DROP COLUMN IF EXISTS technologies;
ALTER TABLE contacts DROP COLUMN IF EXISTS funding_stage;
ALTER TABLE contacts DROP COLUMN IF EXISTS job_function;
ALTER TABLE contacts DROP COLUMN IF EXISTS hq_location;
ALTER TABLE contacts DROP COLUMN IF EXISTS person_keywords;
ALTER TABLE contacts DROP COLUMN IF EXISTS years_in_role;
ALTER TABLE contacts DROP COLUMN IF EXISTS education_summary;
ALTER TABLE contacts DROP COLUMN IF EXISTS buying_intent_topics;
ALTER TABLE contacts DROP COLUMN IF EXISTS naics_or_industry_code;
ALTER TABLE contacts DROP COLUMN IF EXISTS company_public_private;
