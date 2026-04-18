/**
 * CALENDLY_ACCOUNT_MAP — when you use YOUR Calendly for some flows and a CLIENT'S
 * Calendly (different org) for others, map each Calendly organization or user URI
 * to either "agency" or a specific warehouse client_id.
 *
 * Example (single-line JSON in .env):
 * {"https://api.calendly.com/organizations/ABC":{"type":"agency"},"https://api.calendly.com/organizations/XYZ":{"type":"client","client_id":"<uuid>"}}
 */

export type CalendlyAccountMapEntry =
  | { type: "agency" }
  | { type: "client"; client_id: string };

export function resolveCalendlyAccountMap(
  organizationUri: string | null,
  userUri: string | null
): { entry: CalendlyAccountMapEntry | null; matchedKey: string | null } {
  const raw = process.env.CALENDLY_ACCOUNT_MAP?.trim();
  if (!raw) return { entry: null, matchedKey: null };

  let map: Record<string, CalendlyAccountMapEntry>;
  try {
    map = JSON.parse(raw) as Record<string, CalendlyAccountMapEntry>;
  } catch {
    return { entry: null, matchedKey: null };
  }

  for (const key of [organizationUri, userUri]) {
    if (!key) continue;
    const entry = map[key];
    if (entry && (entry.type === "agency" || entry.type === "client")) {
      if (entry.type === "client" && (!entry.client_id || typeof entry.client_id !== "string")) {
        continue;
      }
      return { entry, matchedKey: key };
    }
  }

  return { entry: null, matchedKey: null };
}
