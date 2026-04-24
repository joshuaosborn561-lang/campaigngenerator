-- pgcrypto install puts pgp_* in `extensions` schema; encrypt functions must see it
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.encrypt_api_key(plain TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions
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

CREATE OR REPLACE FUNCTION private.decrypt_api_key(enc BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions
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
