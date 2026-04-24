import type { DBClient } from "../types/index.js";

/**
 * Optional SmartLead / HeyReach **account** API keys on the sync worker (Railway env).
 * When set, they override per-client keys from the database for that platform so one
 * workspace key pulls every campaign under that SmartLead/HeyReach account.
 *
 * Per-client DB keys still apply when the env var is unset (multi-tenant).
 */
export function resolveSmartLeadApiKey(client: DBClient): string | null {
  const account =
    process.env.SMARTLEAD_ACCOUNT_API_KEY?.trim() ||
    process.env.SMARTLEAD_API_KEY?.trim();
  if (account) return account;
  const fromDb = client.smartlead_api_key?.trim();
  return fromDb || null;
}

export function resolveHeyReachApiKey(client: DBClient): string | null {
  const account =
    process.env.HEYREACH_ACCOUNT_API_KEY?.trim() ||
    process.env.HEYREACH_API_KEY?.trim();
  if (account) return account;
  const fromDb = client.heyreach_api_key?.trim();
  return fromDb || null;
}

export function hasAnyOutreachKey(client: DBClient): boolean {
  return !!(resolveSmartLeadApiKey(client) || resolveHeyReachApiKey(client));
}
