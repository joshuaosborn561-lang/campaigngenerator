import type { DBClient } from "../types/index.js";

/**
 * When your SmartLead account is agency/white-label, list campaigns with `?client_id=` so
 * the API returns that sub-workspace. Set in Railway: SMARTLEAD_CLIENT_ID or
 * SMARTLEAD_DEFAULT_CLIENT_ID (numeric sub-account / client id from SmartLead).
 */
export function getSmartLeadCampaignListParams():
  | { client_id?: string; include_tags?: string }
  | undefined {
  const id =
    process.env.SMARTLEAD_CLIENT_ID?.trim() ||
    process.env.SMARTLEAD_DEFAULT_CLIENT_ID?.trim();
  if (id && /^\d+$/.test(id)) {
    return { client_id: id, include_tags: "true" };
  }
  if (process.env.SMARTLEAD_INCLUDE_TAGS === "1" || process.env.SMARTLEAD_INCLUDE_TAGS === "true") {
    return { include_tags: "true" };
  }
  return undefined;
}

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
