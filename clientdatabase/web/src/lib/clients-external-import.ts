/**
 * Import clients from the SalesGlider / Reply Handler (or any) JSON endpoint.
 *
 * --- Add this to the OTHER app (e.g. app-production-9354) as a Route Handler ---
 * Path suggestion: `app/api/agency-intel/clients/route.ts`
 *
 * export async function GET(req: Request) {
 *   const secret = process.env.AGENCY_INTEL_SYNC_SECRET;
 *   if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
 *     return Response.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 *   const rows = await db.client.findMany(); // your ORM
 *   return Response.json({
 *     clients: rows.map((c) => ({
 *       name: c.name,
 *       industry_vertical: c.industry ?? null,
 *       smartlead_api_key: c.smartleadApiKey ?? null,
 *       heyreach_api_key: c.heyreachApiKey ?? null,
 *       notes: c.notes ?? null,
 *     })),
 *   });
 * }
 *
 * Then set in Agency Intelligence (this app):
 *   EXTERNAL_CLIENTS_SYNC_URL=https://app-production-9354.up.railway.app/api/agency-intel/clients
 *   EXTERNAL_CLIENTS_SYNC_BEARER_TOKEN=<same value as AGENCY_INTEL_SYNC_SECRET on the other app>
 */

export type ExternalClientRow = {
  name: string;
  industry_vertical?: string | null;
  smartlead_api_key?: string | null;
  heyreach_api_key?: string | null;
  notes?: string | null;
};

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Normalize one object from various possible API shapes. */
export function normalizeExternalClient(raw: Record<string, unknown>): ExternalClientRow | null {
  const name =
    pickString(raw.name) ??
    pickString(raw.clientName) ??
    pickString(raw.client_name) ??
    pickString(raw.title);
  if (!name) return null;

  const industry_vertical =
    pickString(raw.industry_vertical) ??
    pickString(raw.industry) ??
    pickString(raw.vertical) ??
    null;

  const smartlead_api_key =
    pickString(raw.smartlead_api_key) ??
    pickString(raw.smartLeadApiKey) ??
    pickString(raw.smartleadApiKey) ??
    null;

  const heyreach_api_key =
    pickString(raw.heyreach_api_key) ??
    pickString(raw.heyReachApiKey) ??
    pickString(raw.heyreachApiKey) ??
    null;

  const notes =
    pickString(raw.notes) ??
    pickString(raw.note) ??
    null;

  return {
    name,
    industry_vertical,
    smartlead_api_key,
    heyreach_api_key,
    notes,
  };
}

export function parseExternalClientsPayload(json: unknown): ExternalClientRow[] {
  let list: unknown[] = [];
  if (Array.isArray(json)) {
    list = json;
  } else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.clients)) list = o.clients;
    else if (Array.isArray(o.data)) list = o.data;
    else if (Array.isArray(o.results)) list = o.results;
  }

  const out: ExternalClientRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = normalizeExternalClient(item as Record<string, unknown>);
    if (row) out.push(row);
  }
  return out;
}
