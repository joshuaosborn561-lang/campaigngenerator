/**
 * Prospeo API client.
 *
 * Uses the current (post-migration) endpoints:
 *   - POST /enrich-person        → single record
 *   - POST /bulk-enrich-person   → up to 50 records per call
 *
 * https://prospeo.io/api-docs/bulk-enrich-person
 * https://prospeo.io/api-docs/enrich-person
 * Rate limit: ~150 req/min across Prospeo endpoints.
 */

const BASE = "https://api.prospeo.io";

// Prospeo's bulk endpoint caps at 50 records per request.
export const PROSPEO_BULK_MAX = 50;

export interface ProspeoPersonInput {
  identifier: string; // echoed back in the response so we can match results to rows
  full_name?: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  company_name?: string;
  company_website?: string;
  company_linkedin_url?: string;
  email?: string;
}

export interface ProspeoEnrichedPerson {
  identifier: string;
  email: string | null;
  email_status: string | null; // valid / invalid / catch_all / unknown
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  linkedin_url?: string | null;
  title?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  company_linkedin_url?: string | null;
  error?: string;
  raw?: unknown;
}

interface ProspeoApiResponse {
  error?: boolean;
  message?: string;
  response?: any;
}

function extractPerson(node: any, fallbackId: string): ProspeoEnrichedPerson {
  if (!node) {
    return { identifier: fallbackId, email: null, email_status: null };
  }
  // Bulk responses wrap each result as { identifier, person: {...}, company: {...} }
  // or sometimes flatten it. Handle both shapes.
  const person = node.person || node;
  const company = node.company || person?.company || {};

  const email =
    node.email ??
    person?.email ??
    (Array.isArray(person?.emails) ? person.emails[0]?.email : null) ??
    null;

  const email_status =
    node.email_status ??
    person?.email_status ??
    (Array.isArray(person?.emails) ? person.emails[0]?.status : null) ??
    null;

  return {
    identifier: node.identifier ?? person?.identifier ?? fallbackId,
    email,
    email_status,
    first_name: person?.first_name ?? null,
    last_name: person?.last_name ?? null,
    full_name: person?.full_name ?? null,
    linkedin_url: person?.linkedin_url ?? null,
    title: person?.title ?? person?.headline ?? null,
    company_name: company?.name ?? person?.company_name ?? null,
    company_domain: company?.website ?? company?.domain ?? null,
    company_linkedin_url: company?.linkedin_url ?? null,
    raw: node,
  };
}

async function postJson(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string
): Promise<ProspeoApiResponse> {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "X-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as ProspeoApiResponse;

  if (!res.ok) {
    return { error: true, message: data.message || `HTTP ${res.status}` };
  }
  return data;
}

/**
 * Enrich a single person.
 */
export async function enrichPerson(
  input: ProspeoPersonInput,
  apiKey: string
): Promise<ProspeoEnrichedPerson> {
  const { identifier, ...body } = input;
  try {
    const data = await postJson(
      "/enrich-person",
      { only_verified_email: false, ...body },
      apiKey
    );
    if (data.error) {
      return { identifier, email: null, email_status: null, error: data.message };
    }
    return extractPerson(data.response, identifier);
  } catch (err: any) {
    return {
      identifier,
      email: null,
      email_status: null,
      error: err.message || "Network error",
    };
  }
}

/**
 * Bulk-enrich up to PROSPEO_BULK_MAX (50) persons in a single call.
 * Returns results keyed by identifier so callers can match them back to their
 * source rows regardless of response ordering.
 */
export async function bulkEnrichPersons(
  people: ProspeoPersonInput[],
  apiKey: string
): Promise<ProspeoEnrichedPerson[]> {
  if (people.length === 0) return [];
  if (people.length > PROSPEO_BULK_MAX) {
    throw new Error(
      `bulkEnrichPersons received ${people.length} records; max is ${PROSPEO_BULK_MAX}. Chunk before calling.`
    );
  }

  try {
    const data = await postJson(
      "/bulk-enrich-person",
      { only_verified_email: false, enrich_mobile: false, data: people },
      apiKey
    );

    if (data.error) {
      return people.map((p) => ({
        identifier: p.identifier,
        email: null,
        email_status: null,
        error: data.message || "Prospeo bulk request failed",
      }));
    }

    const raw = data.response;
    const results: any[] = Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
        ? raw
        : [];

    // Build a map keyed by identifier so we survive response re-ordering.
    const byId = new Map<string, ProspeoEnrichedPerson>();
    for (const node of results) {
      const parsed = extractPerson(node, node?.identifier ?? "");
      if (parsed.identifier) byId.set(parsed.identifier, parsed);
    }

    return people.map((p) => {
      return (
        byId.get(p.identifier) ?? {
          identifier: p.identifier,
          email: null,
          email_status: null,
          error: "No result returned",
        }
      );
    });
  } catch (err: any) {
    return people.map((p) => ({
      identifier: p.identifier,
      email: null,
      email_status: null,
      error: err.message || "Network error",
    }));
  }
}

/**
 * Enrich an arbitrary-sized list by chunking into 50-record batches and
 * running up to `parallelBatches` batches concurrently. Caller gets back one
 * result per input, in input order.
 */
export async function bulkEnrichAll(
  people: ProspeoPersonInput[],
  apiKey: string,
  parallelBatches: number = 3
): Promise<ProspeoEnrichedPerson[]> {
  if (people.length === 0) return [];

  const chunks: ProspeoPersonInput[][] = [];
  for (let i = 0; i < people.length; i += PROSPEO_BULK_MAX) {
    chunks.push(people.slice(i, i + PROSPEO_BULK_MAX));
  }

  const chunkResults: ProspeoEnrichedPerson[][] = new Array(chunks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < chunks.length) {
      const i = cursor++;
      chunkResults[i] = await bulkEnrichPersons(chunks[i], apiKey);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(parallelBatches, chunks.length) }, worker)
  );

  return chunkResults.flat();
}
