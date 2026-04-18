import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { logIngestError, logIngestSuccess } from "@/lib/ingest/log";
import { ingestClientSchema } from "@/lib/ingest/schemas";

const TABLE = "synced_clients";

export async function POST(req: NextRequest) {
  const authErr = checkIngestAuth(req);
  if (authErr) return authErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    logIngestError(TABLE, e);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ingestClientSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`[ingest] ${TABLE} validation failed`, parsed.error.flatten());
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const p = parsed.data;
  const row = {
    source_app: p.source_app,
    source_id: p.source_id,
    name: p.name,
    unified_client_id: p.unified_client_id ?? null,
    data: p.data ?? {},
  };

  const { error } = await supabase.from(TABLE).upsert(row, {
    onConflict: "source_app,source_id",
  });

  if (error) {
    console.error(`[ingest] ${TABLE} upsert failed`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logIngestSuccess(TABLE, p.source_app, p.source_id);
  return NextResponse.json({ ok: true, table: TABLE });
}
