/**
 * Hourly / manual full sync: SmartLead + HeyReach → Supabase, then Gemini inference.
 *
 * Run from repo: cd clientdatabase/sync && npm run sync-from-platforms
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY (for inference)
 *
 * Env is loaded by sync/src/nightly-sync.ts (dotenv).
 */

import { runFullPlatformSync } from "../sync/src/nightly-sync.ts";

runFullPlatformSync()
  .then((summary) => {
    console.log("Done:", summary);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
