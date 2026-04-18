import { NextRequest, NextResponse } from "next/server";

export function checkIngestAuth(req: NextRequest): NextResponse | null {
  const key = process.env.INGEST_API_KEY?.trim();
  if (!key) {
    console.error("[ingest] INGEST_API_KEY is not set — refusing requests");
    return NextResponse.json(
      { error: "Server misconfiguration: INGEST_API_KEY not set" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${key}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
