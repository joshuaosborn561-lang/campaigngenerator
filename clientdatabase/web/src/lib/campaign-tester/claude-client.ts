/**
 * Anthropic SDK wrapper for the Campaign Testing Machine.
 *
 * Every call composes: global best-practice checklist + task system prompt +
 * historical warehouse pack (Calendly-verified counts, top campaigns, offer
 * types, subject lines). Claude is instructed to prefer that pack over priors.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_BEST_PRACTICES_AND_DATA_PRIORITY } from "@/lib/claude-context/claude-grounding";
import {
  buildHistoricalDataPack,
  type ClaudeGroundingOptions,
} from "@/lib/claude-context/historical-data-pack";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export type ClaudeMessageParam = { role: "user" | "assistant"; content: string };

export interface ClaudeCallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /**
   * Controls which warehouse rows populate the historical pack. Always applied —
   * defaults to agency-wide when omitted.
   */
  grounding?: ClaudeGroundingOptions;
}

/**
 * Multi-turn messages API (for interactive chat UIs). Same system + pack as
 * `callClaude` but with full conversation history.
 */
export interface ClaudeMultiOptions {
  system: string;
  messages: ClaudeMessageParam[];
  maxTokens?: number;
  grounding?: ClaudeGroundingOptions;
}

export async function callClaudeMulti(opts: ClaudeMultiOptions): Promise<string> {
  const grounding: ClaudeGroundingOptions = opts.grounding ?? {
    clientId: null,
    industryVertical: null,
  };
  const pack = await buildHistoricalDataPack(grounding);
  const system = [
    CLAUDE_BEST_PRACTICES_AND_DATA_PRIORITY,
    "",
    "--- TASK INSTRUCTIONS ---",
    "",
    opts.system,
    "",
    "--- HISTORICAL WAREHOUSE PACK (prefer this over generic advice) ---",
    "",
    pack,
  ].join("\n");

  if (!opts.messages.length) {
    throw new Error("callClaudeMulti: messages must not be empty");
  }
  const apiMessages = opts.messages.map((m) => {
    if (m.role === "user") {
      return { role: "user" as const, content: m.content };
    }
    return { role: "assistant" as const, content: m.content };
  });
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? MAX_TOKENS,
    system,
    messages: apiMessages,
  });
  const t = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!t) {
    throw new Error("Claude returned no text content");
  }
  return t;
}

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const grounding: ClaudeGroundingOptions = opts.grounding ?? {
    clientId: null,
    industryVertical: null,
  };
  const pack = await buildHistoricalDataPack(grounding);

  const system = [
    CLAUDE_BEST_PRACTICES_AND_DATA_PRIORITY,
    "",
    "--- TASK INSTRUCTIONS ---",
    "",
    opts.system,
    "",
    "--- HISTORICAL WAREHOUSE PACK (prefer this over generic advice) ---",
    "",
    pack,
  ].join("\n");

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? MAX_TOKENS,
    system,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude returned no text content");
  }
  return text;
}

/**
 * Attempts to extract a JSON object from a Claude response.
 */
export function parseJsonFromClaude<T = unknown>(raw: string): T {
  let s = raw.trim();

  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) s = fenceMatch[1].trim();

  const braceIdx = s.indexOf("{");
  const bracketIdx = s.indexOf("[");
  let start = -1;
  if (braceIdx >= 0 && bracketIdx >= 0) {
    start = Math.min(braceIdx, bracketIdx);
  } else if (braceIdx >= 0) {
    start = braceIdx;
  } else if (bracketIdx >= 0) {
    start = bracketIdx;
  }
  if (start > 0) s = s.slice(start);

  try {
    return JSON.parse(s) as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse Claude JSON: ${msg}\nRaw: ${raw.slice(0, 500)}`);
  }
}
