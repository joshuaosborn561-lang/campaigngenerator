import { supabase } from "@/lib/supabase";
import {
  parseExternalClientsPayload,
  type ExternalClientRow,
} from "@/lib/clients-external-import";

export type SyncClientsResult =
  | { ok: true; skipped: true; message: string }
  | { ok: true; skipped: false; upserted: number; names: string[] }
  | { ok: false; error: string };

export async function runExternalClientsSync(): Promise<SyncClientsResult> {
  const url = process.env.EXTERNAL_CLIENTS_SYNC_URL?.trim();
  if (!url) {
    return {
      ok: true,
      skipped: true,
      message:
        "EXTERNAL_CLIENTS_SYNC_URL is not set. Add an export route on the Reply Handler app and set the env vars.",
    };
  }

  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const bearer = process.env.EXTERNAL_CLIENTS_SYNC_BEARER_TOKEN?.trim();
  if (bearer) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${bearer}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: "no-store", next: { revalidate: 0 } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return { ok: false, error: `Could not reach sync URL: ${msg}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Sync URL returned ${res.status}. ${text.slice(0, 200)}`,
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "Sync URL did not return valid JSON." };
  }

  const rows = parseExternalClientsPayload(json);
  if (rows.length === 0) {
    return { ok: false, error: "No client rows found in the response." };
  }

  const payload = rows.map((r: ExternalClientRow) => ({
    name: r.name,
    industry_vertical: r.industry_vertical ?? null,
    smartlead_api_key: r.smartlead_api_key ?? null,
    heyreach_api_key: r.heyreach_api_key ?? null,
    notes: r.notes ?? null,
  }));

  const { error } = await supabase.from("clients").upsert(payload, {
    onConflict: "name",
    ignoreDuplicates: false,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    skipped: false,
    upserted: payload.length,
    names: payload.map((p) => p.name),
  };
}
