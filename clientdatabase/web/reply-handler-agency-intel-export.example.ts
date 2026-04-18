/**
 * COPY into the SalesGlider / Reply Handler Next.js app as:
 *   app/api/agency-intel/clients/route.ts
 *
 * Replace the DB access with however that app reads clients (Prisma, Drizzle, raw SQL).
 * Set AGENCY_INTEL_SYNC_SECRET in that app's Railway env to a long random string.
 * Use the SAME value as EXTERNAL_CLIENTS_SYNC_BEARER_TOKEN in Agency Intelligence.
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const secret = process.env.AGENCY_INTEL_SYNC_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // TODO: load rows from your database — shape must match ExternalClientRow:
  // { name, industry_vertical?, smartlead_api_key?, heyreach_api_key?, notes? }
  const clients: Array<{
    name: string;
    industry_vertical: string | null;
    smartlead_api_key: string | null;
    heyreach_api_key: string | null;
    notes: string | null;
  }> = [];

  return NextResponse.json({ clients });
}
