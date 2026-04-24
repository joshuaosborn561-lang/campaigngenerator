/**
 * One-off: ensure a "master" client row exists and set SmartLead + HeyReach keys via set_client_api_keys.
 * Expects: SUPABASE_URL, SUPABASE_SERVICE_KEY, SMARTLEAD_API_KEY (or SMARTLEAD_ACCOUNT_API_KEY), HEYREACH_API_KEY (or HEYREACH_ACCOUNT_API_KEY)
 *
 * Run: railway run -s agency-intel-web -- node clientdatabase/scripts/bootstrap-master-client.mjs
 */
import { createClient } from "../web/node_modules/@supabase/supabase-js/dist/index.mjs";
// Path is relative to this file: clientdatabase/scripts/ -> web/node_modules/...

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const sl =
  process.env.SMARTLEAD_ACCOUNT_API_KEY?.trim() ||
  process.env.SMARTLEAD_API_KEY?.trim();
const hr =
  process.env.HEYREACH_ACCOUNT_API_KEY?.trim() ||
  process.env.HEYREACH_API_KEY?.trim();
const name = process.env.MASTER_CLIENT_NAME?.trim() || "SalesGlider Master";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}
if (!sl && !hr) {
  console.error(
    "Set at least one of SMARTLEAD_ACCOUNT_API_KEY / SMARTLEAD_API_KEY, HEYREACH_ACCOUNT_API_KEY / HEYREACH_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: existing, error: findErr } = await supabase
  .from("clients")
  .select("id, name")
  .eq("name", name)
  .maybeSingle();

if (findErr) {
  console.error(findErr.message);
  process.exit(1);
}

let id = existing?.id;
if (!id) {
  const { data: ins, error: insErr } = await supabase
    .from("clients")
    .insert({
      name,
      industry_vertical: "Agency",
      notes: "Default workspace; Notion master SmartLead + HeyReach keys (bootstrap).",
    })
    .select("id")
    .single();
  if (insErr) {
    console.error(insErr.message);
    process.exit(1);
  }
  id = ins.id;
  console.log("Created client:", name, id);
} else {
  console.log("Found existing client:", name, id);
}

const p_keys = {};
if (sl) p_keys.smartlead = sl;
if (hr) p_keys.heyreach = hr;

const { error: kerr } = await supabase.rpc("set_client_api_keys", {
  p_client_id: id,
  p_keys,
});

if (kerr) {
  console.error(kerr.message);
  process.exit(1);
}

console.log("API keys stored (encrypted in DB).");
process.exit(0);
