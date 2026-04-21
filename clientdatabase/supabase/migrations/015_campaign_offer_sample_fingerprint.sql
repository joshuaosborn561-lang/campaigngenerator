-- Track which up-to-25-email sample was used for campaign-level Gemini offer profile
-- (distinct from sequence_fingerprint which hashes all variants).

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS offer_sample_fingerprint TEXT;

COMMENT ON COLUMN campaigns.offer_sample_fingerprint IS 'SHA-256 of the specific ≤25 sequence variants sent to Gemini for offer/ICP email-side context; changes when sampling changes.';
