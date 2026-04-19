/**
 * Railway cron entry: full platform sync + Gemini inference.
 */
import "dotenv/config";
import { runFullPlatformSync } from "./nightly-sync.js";

runFullPlatformSync()
  .then((summary) => {
    console.log("Done:", summary);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
