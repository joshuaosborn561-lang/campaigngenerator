import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { logIngestError, logIngestSuccess } from "@/lib/ingest/log";
import { ingestReplySchema } from "@/lib/ingest/schemas";

const TABLE = "synced_replies";

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

  const parsed = ingestReplySchema.safeParse(body);
  if (!parsed.success) {
    console.error(`[ingest] ${TABLE} validation failed`, parsed.error.flatten());
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const p = parsed.data;
  const row: Record<string, unknown> = {
    source_app: p.source_app,
    source_id: p.source_id,
    unified_client_id: p.unified_client_id ?? null,
    lead_email: p.lead_email ?? null,
    classification: p.classification ?? null,
    reply_text: p.reply_text ?? null,
    data: p.data ?? {},
  };
  if (p.created_at) {
    row.created_at = p.created_at;
  }

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
