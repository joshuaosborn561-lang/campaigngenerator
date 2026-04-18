import { supabase } from "@/lib/supabase";

export type ClientPickerRow = {
  id: string;
  name: string;
  industry_vertical: string | null;
};

export async function listClientsPicker(): Promise<{
  clients: ClientPickerRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, industry_vertical")
    .order("name", { ascending: true });

  if (error) return { clients: [], error: error.message };
  return { clients: data ?? [], error: null };
}
