import { NextRequest, NextResponse } from "next/server";
import { runAgencyQuery } from "@/lib/agency-query";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const result = await runAgencyQuery(question);
    return NextResponse.json({
      answer: result.answer,
      query: result.query,
      explanation: result.explanation,
      results: result.results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("/api/query:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
