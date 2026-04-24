/**
 * Outscraper Google Maps search + optional forward to a Clay table webhook.
 * @see https://docs.outscraper.com/endpoints/google-maps-search/
 */

const OUTSCRAPER_BASE = "https://api.outscraper.com";

export type OutscraperMapsSearchOptions = {
  query: string;
  /** 1–500 per Outscraper docs; default 100 for a single “list” chunk. */
  limit?: number;
  /** Pagination: skip N places, N multiple of 20. */
  skipPlaces?: number;
  /** Map center: "lat,lng" */
  coordinates?: string;
  async?: boolean;
  /** If set, Outscraper POSTs when job completes. */
  webhook?: string;
  language?: string;
  region?: string;
};

function stripUndefined<T extends Record<string, string | number | boolean | undefined>>(
  o: T
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined && v !== null && v !== "") {
      out[k] = String(v);
    }
  }
  return out;
}

export async function outscraperGoogleMapsSearch(
  apiKey: string,
  options: OutscraperMapsSearchOptions
): Promise<unknown> {
  const { query, limit = 100, skipPlaces, coordinates, async: asyncParam, webhook, language, region } = options;
  if (!query?.trim()) {
    throw new Error("query is required");
  }

  const params = new URLSearchParams(
    stripUndefined({
      query: query.trim(),
      limit: Math.min(500, Math.max(1, limit)),
      async: asyncParam === false ? "false" : "true",
      skipPlaces: skipPlaces !== undefined ? String(skipPlaces) : undefined,
      coordinates,
      webhook,
      language: language || "en",
      region: region || "us",
    })
  );

  const url = `${OUTSCRAPER_BASE}/google-maps-search?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
  });

  const data = (await res.json().catch(() => ({}))) as { errorMessage?: string; id?: string; status?: string; data?: unknown };
  if (!res.ok) {
    throw new Error(
      (data as { errorMessage?: string })?.errorMessage || `Outscraper HTTP ${res.status}`
    );
  }
  return data;
}

/**
 * Flattens Outscraper `data` array of arrays into a list of place objects for Clay.
 */
export function flattenOutscraperPlaces(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (!Array.isArray(data)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const batch of data) {
    if (!Array.isArray(batch)) continue;
    for (const row of batch) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        rows.push(row as Record<string, unknown>);
      }
    }
  }
  return rows;
}

/**
 * Send each place as one POST to a Clay inbound webhook.
 * Batches in chunks to avoid body size issues (optional: reduce concurrency).
 */
export async function postPlacesToClayWebhook(
  webhookUrl: string,
  places: Record<string, unknown>[],
  options?: {
    authToken?: string;
    idempotencyKeyPrefix?: string;
    /** Merged into every row (e.g. campaign + client for Clay routing). */
    campaignContext?: Record<string, string | null | undefined>;
  }
): Promise<{ ok: number; failed: number }> {
  if (!webhookUrl?.trim()) {
    throw new Error("webhookUrl is required");
  }
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < places.length; i++) {
    const extra = options?.campaignContext
      ? Object.fromEntries(
          Object.entries(options.campaignContext).filter(
            (e): e is [string, string] => e[1] != null && e[1] !== ""
          )
        )
      : {};
    const payload = {
      ...places[i],
      ...extra,
      _source: "outscraper_google_maps",
      _ingested_at: new Date().toISOString(),
      _row_index: i,
    };
    if (options?.idempotencyKeyPrefix) {
      (payload as { _idempotency_key?: string })._idempotency_key = `${options.idempotencyKeyPrefix}-${i}`;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (options?.authToken) {
        headers.Authorization = `Bearer ${options.authToken}`;
      }
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        ok++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}
