import { NextRequest, NextResponse } from "next/server";
import { runExternalClientsSync } from "@/lib/run-external-clients-sync";

/**
 * POST /api/clients/sync-external
 * Same logic as the server action — for Railway cron or manual curl.
 * Optional: set CLIENTS_SYNC_SECRET and send header x-agency-sync-secret or Authorization: Bearer
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CLIENTS_SYNC_SECRET?.trim();
  if (secret) {
    const h = req.headers.get("x-agency-sync-secret");
    const auth = req.headers.get("authorization");
    const ok =
      h === secret ||
      auth === `Bearer ${secret}` ||
      auth === secret;
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runExternalClientsSync();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
