-- Migration 003: Allow LinkedIn-only contacts (nullable email, dedupe by linkedin_url)
--
-- Why:
--   HeyReach sync brings in contacts we only know from LinkedIn — we don't
--   have their email until they reply (and we enrich via Prospeo). The
--   original schema required email NOT NULL UNIQUE, which forced the sync
--   to invent placeholder emails like `foo_in_joe@linkedin.placeholder`.
--   Those placeholders then leaked into the Apollo CSV diff flow as fake
--   "cached" emails, and caused duplicate rows when Prospeo later found
--   the real address.
--
-- Fix:
--   - email becomes nullable (the existing `contacts_email_key` UNIQUE
--     constraint stays, because PostgreSQL treats NULLs as distinct by
--     default — multiple rows can have email = NULL under a regular
--     UNIQUE constraint).
--   - linkedin_url gets a partial unique index so it can act as the
--     dedup key when email is absent.
--   - Any leftover placeholder rows from earlier sync runs get their email
--     cleared so the upsert paths re-hydrate them from the real source.

-- ============================================================
-- 1. Clean up any placeholder emails that may have been written
--    before this migration landed.
-- ============================================================
UPDATE contacts
SET email = NULL
WHERE email LIKE '%@linkedin.placeholder'
   OR email LIKE '%@placeholder.local';

-- ============================================================
-- 2. Drop NOT NULL on email. Keep the existing contacts_email_key
--    UNIQUE constraint — under PostgreSQL's default NULLS DISTINCT
--    behaviour, multiple rows with NULL email are still allowed,
--    and existing `ON CONFLICT (email)` upsert paths keep working.
-- ============================================================
ALTER TABLE contacts ALTER COLUMN email DROP NOT NULL;

-- ============================================================
-- 3. Partial unique index on linkedin_url so it can serve as the
--    dedup key for LinkedIn-only (email IS NULL) contacts.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS contacts_linkedin_url_unique
    ON contacts (linkedin_url)
    WHERE linkedin_url IS NOT NULL;

-- ============================================================
-- 4. Clean out any orphan rows that have neither identifier.
--    (Safety sweep so the CHECK constraint below doesn't fail.)
-- ============================================================
DELETE FROM contacts
WHERE email IS NULL AND linkedin_url IS NULL;

-- ============================================================
-- 5. Add a sanity constraint: a contact must have at least one
--    identifier (email or linkedin_url). Otherwise it's junk.
--    Wrapped in a DO block so re-running the migration is safe.
-- ============================================================
DO $$
BEGIN
    ALTER TABLE contacts
        ADD CONSTRAINT contacts_identity_present
        CHECK (email IS NOT NULL OR linkedin_url IS NOT NULL);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
