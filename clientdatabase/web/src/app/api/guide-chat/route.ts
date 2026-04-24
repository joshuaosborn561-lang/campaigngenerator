import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { PRODUCT_GUIDE_KNOWLEDGE } from "@/lib/product-guide-knowledge";

const SYSTEM = `You are the in-app **Platform Guide** for the Agency Intelligence product. Your job is to help operators understand what to do next, where to click, and how pieces fit together.

Rules:
- Answer ONLY using the knowledge base below plus general UX hints about this app (sidebar: Home, Clients, AI Analyst, Campaign tester). The old /contacts and /intelligence routes redirect into AI Analyst. If something is not covered, say you are not sure and suggest checking Supabase migrations or env vars from .env.example.
- Be concise, friendly, and actionable. Use short paragraphs or numbered steps.
- Use **markdown**: **bold** for emphasis, bullet lists where helpful.
- Never invent API field names that are not in the knowledge base.
- If the user says where they are (pathname), tailor the first sentence to that screen.

KNOWLEDGE BASE:
${PRODUCT_GUIDE_KNOWLEDGE}
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, pathname } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const genai = new GoogleGenAI({ apiKey });

    const geminiHistory = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

    const last = messages[messages.length - 1]?.content ?? "";
    const contextual =
      typeof pathname === "string" && pathname.length > 0
        ? `[User is viewing path: ${pathname}]\n\n${last}`
        : last;

    const session = await genai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM,
      },
      history: geminiHistory,
    });

    const response = await session.sendMessage({ message: contextual });
    const text = response.text ?? "I could not generate a reply. Try asking in different words.";

    return NextResponse.json({ response: text });
  } catch (err: unknown) {
    console.error("guide-chat error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
