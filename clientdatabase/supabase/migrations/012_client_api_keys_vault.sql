-- Encrypted SmartLead / HeyReach API keys: Vault holds the AES passphrase; column values are pgcrypto-encrypted.
-- After apply: plaintext key columns are removed. Use get_clients_for_sync() and set_client_api_keys().

CREATE SCHEMA IF NOT EXISTS private;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vault WITH SCHEMA vault;

-- Project-level passphrase (64 hex chars = 32 bytes), stored only inside Vault
DO $$
DECLARE
  passphrase TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets s WHERE s.name = 'clients_api_encryption_key'
  ) THEN
    PERFORM vault.create_secret(
      passphrase,
      'clients_api_encryption_key',
      'Passphrase for pgp_sym_encrypt on clients API key columns'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.clients_encryption_passphrase()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret::text
  FROM vault.decrypted_secrets
  WHERE name = 'clients_api_encryption_key'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.clients_encryption_passphrase() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.encrypt_api_key(plain TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  pw TEXT;
BEGIN
  IF plain IS NULL OR btrim(plain) = '' THEN
    RETURN NULL;
  END IF;
  pw := private.clients_encryption_passphrase();
  IF pw IS NULL OR btrim(pw) = '' THEN
    RAISE EXCEPTION 'Vault secret clients_api_encryption_key is missing';
  END IF;
  RETURN pgp_sym_encrypt(btrim(plain), pw, 'cipher-algo=aes256');
END;
$$;

REVOKE ALL ON FUNCTION private.encrypt_api_key(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.decrypt_api_key(enc BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  pw TEXT;
BEGIN
  IF enc IS NULL THEN
    RETURN NULL;
  END IF;
  pw := private.clients_encryption_passphrase();
  IF pw IS NULL OR btrim(pw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(enc, pw);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.decrypt_api_key(BYTEA) FROM PUBLIC;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS smartlead_api_key_enc BYTEA,
  ADD COLUMN IF NOT EXISTS heyreach_api_key_enc BYTEA;

UPDATE clients
SET
  smartlead_api_key_enc = private.encrypt_api_key(smartlead_api_key),
  heyreach_api_key_enc = private.encrypt_api_key(heyreach_api_key)
WHERE smartlead_api_key IS NOT NULL OR heyreach_api_key IS NOT NULL;

ALTER TABLE clients DROP COLUMN IF EXISTS smartlead_api_key;
ALTER TABLE clients DROP COLUMN IF EXISTS heyreach_api_key;

-- Decrypted rows for the sync worker only (callable via RPC; avoid a public view that /api/query could SELECT).
CREATE OR REPLACE FUNCTION get_clients_for_sync()
RETURNS TABLE (
  id UUID,
  name TEXT,
  industry_vertical TEXT,
  smartlead_api_key TEXT,
  heyreach_api_key TEXT,
  sync_enabled BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    c.id,
    c.name,
    c.industry_vertical,
    private.decrypt_api_key(c.smartlead_api_key_enc),
    private.decrypt_api_key(c.heyreach_api_key_enc),
    c.sync_enabled,
    c.created_at,
    c.updated_at
  FROM clients c
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION get_clients_for_sync() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_clients_for_sync() TO service_role;

COMMENT ON FUNCTION get_clients_for_sync IS 'Returns clients with decrypted platform API keys for the sync job.';

-- p_keys: {"smartlead":"..."} and/or {"heyreach":"..."} — only present keys are updated; "" clears
CREATE OR REPLACE FUNCTION set_client_api_keys(p_client_id UUID, p_keys JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  sl TEXT;
  hr TEXT;
BEGIN
  IF p_keys ? 'smartlead' THEN
    sl := p_keys->>'smartlead';
    UPDATE clients SET
      smartlead_api_key_enc = CASE
        WHEN sl IS NULL OR btrim(sl) = '' THEN NULL
        ELSE private.encrypt_api_key(btrim(sl))
      END,
      updated_at = now()
    WHERE id = p_client_id;
  END IF;

  IF p_keys ? 'heyreach' THEN
    hr := p_keys->>'heyreach';
    UPDATE clients SET
      heyreach_api_key_enc = CASE
        WHEN hr IS NULL OR btrim(hr) = '' THEN NULL
        ELSE private.encrypt_api_key(btrim(hr))
      END,
      updated_at = now()
    WHERE id = p_client_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_client_api_keys(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_client_api_keys(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION set_client_api_keys IS 'Encrypt and store API keys. JSON keys smartlead, heyreach; omit to leave unchanged.';
