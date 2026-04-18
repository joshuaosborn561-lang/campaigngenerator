import { NextResponse } from "next/server";
import { listClientsPicker } from "@/lib/clients-list";

/**
 * GET /api/campaign-tester/clients
 * List all clients for the brief client-picker (same as GET /api/clients).
 */
export async function GET() {
  const { clients, error } = await listClientsPicker();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ clients });
}
