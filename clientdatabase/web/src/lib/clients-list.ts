import { supabase } from "@/lib/supabase";

export type ClientPickerRow = {
  id: string;
  name: string;
  industry_vertical: string | null;
  sync_enabled?: boolean | null;
  has_smartlead_key?: boolean;
  has_heyreach_key?: boolean;
  notes?: string | null;
};

export async function listClientsPicker(): Promise<{
  clients: ClientPickerRow[];
  summary: {
    total: number;
    active: number;
    smartleadConnected: number;
    heyreachConnected: number;
  };
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, industry_vertical, sync_enabled, notes, smartlead_api_key_enc, heyreach_api_key_enc")
    .order("name", { ascending: true });

  if (error) {
    return {
      clients: [],
      summary: { total: 0, active: 0, smartleadConnected: 0, heyreachConnected: 0 },
      error: error.message,
    };
  }
  const clients =
    (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      industry_vertical: c.industry_vertical ?? null,
      sync_enabled: c.sync_enabled ?? null,
      notes: c.notes ?? null,
      has_smartlead_key: Boolean(c.smartlead_api_key_enc),
      has_heyreach_key: Boolean(c.heyreach_api_key_enc),
    })) satisfies ClientPickerRow[];

  const summary = {
    total: clients.length,
    active: clients.filter((c) => c.sync_enabled !== false).length,
    smartleadConnected: clients.filter((c) => Boolean(c.has_smartlead_key)).length,
    heyreachConnected: clients.filter((c) => Boolean(c.has_heyreach_key)).length,
  };

  return { clients, summary, error: null };
}
