import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import { supabase } from "./supabase";

const SYSTEM_PROMPT = `You are the Agency Intelligence Assistant — an AI analyst for a B2B outbound agency. You have access to a Supabase database containing all campaign data across multiple clients.

DATABASE SCHEMA:
- clients: id, name, industry_vertical
- campaigns: id, client_id, name, status, target_title, target_company_size, target_industry, target_geography, offer_type, copy_patterns[], send_volume, open_rate, reply_rate, bounce_rate, positive_reply_count, negative_reply_count, meetings_booked, list_source, campaign_start_date, gemini_offer_profile (jsonb — campaign-level offer decomposition), inferred_icp (jsonb — structured ICP from lead samples), inferred_at
- sequence_steps: id, campaign_id, step_number, variant_label, subject_line, email_body, open_rate, reply_rate, offer_type, copy_patterns[], inferred_offer_angle (jsonb — per-variant email decomposition)
- leads: id, campaign_id, email, first_name, last_name, company, title, industry, company_size, seniority, department, city, state, country, category, reply_sentiment, meeting_booked, has_replied, is_unsubscribed, is_hostile
- email_events: id, campaign_id, lead_id, event_type, event_timestamp, sequence_step, metadata
- contacts: id, email, first_name, last_name, full_name, title, seniority, department, linkedin_url, company_name, company_domain, company_industry, company_size, company_revenue, city, state, country, tags[], technologies[], funding_stage, job_function, hq_location, person_keywords[], buying_intent_topics[], naics_or_industry_code, company_public_private, is_unsubscribed, is_hostile_opt_out, source_platform, total_campaigns, total_emails_sent, total_replies, overall_status, meeting_booked
- calendly_events: id, invitee_email, invitee_name, status (active|canceled), event_start_at, event_end_at, canceled_at, contact_id, lead_id, event_name, source_organization_uri, source_user_uri, meeting_scope (agency|client|mixed|unknown), inferred_client_id, attribution_rule — Calendly truth; source_* identifies which Calendly account sent the event; CALENDLY_ACCOUNT_MAP maps org/user to agency vs client.

VIEWS:
- campaign_performance: joins campaigns + clients (campaign_name, client_name, industry_vertical, target_title, target_industry, offer_type, copy_patterns, send_volume, open_rate, reply_rate, bounce_rate, positive_reply_count, meetings_booked, list_source, campaign_start_date, status)
- subject_line_performance: joins sequence_steps + campaigns + clients (subject_line, industry_vertical, target_title, offer_type, open_rate, reply_rate, campaign_name, client_name)
- contact_search: all contact fields for lead-database style filtering

IMPORTANT RULES:
1. Generate Supabase JS queries using the provided query tools — NOT raw SQL.
2. Give narrative, actionable answers. Don't dump raw data.
3. When showing patterns, surface the insight clearly.
4. When data is limited, say so honestly.
5. Always include sample sizes so the user can judge significance.
6. For "what works" questions, rank by reply_rate and note volume.`;

const filterSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      column: { type: Type.STRING },
      op: {
        type: Type.STRING,
        enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is"],
      },
      value: { type: Type.STRING },
    },
    required: ["column", "op", "value"],
  },
};

const TOOLS = [
  {
    name: "query_campaigns",
    description:
      "Query the campaign_performance view. Returns campaign data with client info. Use filters and ordering to answer performance questions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        select: { type: Type.STRING, description: 'Columns to select, e.g. "campaign_name, client_name, reply_rate, offer_type"' },
        filters: filterSchema,
        order_by: { type: Type.STRING, description: "Column to order by" },
        ascending: { type: Type.BOOLEAN, description: "Sort ascending (default false)" },
        limit: { type: Type.NUMBER, description: "Max rows to return (default 25)" },
      },
      required: ["select"],
    },
  },
  {
    name: "query_subject_lines",
    description: "Query the subject_line_performance view. Returns subject lines with their open/reply rates.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        select: { type: Type.STRING },
        filters: filterSchema,
        order_by: { type: Type.STRING },
        ascending: { type: Type.BOOLEAN },
        limit: { type: Type.NUMBER },
      },
      required: ["select"],
    },
  },
  {
    name: "query_leads",
    description: "Query the leads table. Useful for sentiment breakdowns, meeting counts, category analysis.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        select: { type: Type.STRING },
        filters: filterSchema,
        order_by: { type: Type.STRING },
        ascending: { type: Type.BOOLEAN },
        limit: { type: Type.NUMBER },
      },
      required: ["select"],
    },
  },
  {
    name: "query_contacts",
    description: "Query the contact_search view. Lead-database style contact filtering by name, title, seniority, department, company, industry, size, location, status.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        select: { type: Type.STRING },
        filters: filterSchema,
        order_by: { type: Type.STRING },
        ascending: { type: Type.BOOLEAN },
        limit: { type: Type.NUMBER },
      },
      required: ["select"],
    },
  },
  {
    name: "query_calendly_events",
    description:
      "Query calendly_events — Calendly-verified scheduled meetings (webhook). Use for true meetings booked vs platform-reported flags. Filter by status, invitee_email, event_start_at, contact_id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        select: { type: Type.STRING },
        filters: filterSchema,
        order_by: { type: Type.STRING },
        ascending: { type: Type.BOOLEAN },
        limit: { type: Type.NUMBER },
      },
      required: ["select"],
    },
  },
  {
    name: "query_sequence_steps",
    description: "Query sequence_steps. Useful for analyzing email copy, subject lines per step, A/B variants.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        select: { type: Type.STRING },
        filters: filterSchema,
        order_by: { type: Type.STRING },
        ascending: { type: Type.BOOLEAN },
        limit: { type: Type.NUMBER },
      },
      required: ["select"],
    },
  },
  {
    name: "aggregate_query",
    description: "Run an aggregate query. For computing averages, counts, grouped stats.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        table: {
          type: Type.STRING,
          enum: [
            "campaigns",
            "campaign_performance",
            "subject_line_performance",
            "leads",
            "sequence_steps",
            "contacts",
            "contact_search",
            "calendly_events",
          ],
        },
        select: { type: Type.STRING, description: 'Select with aggregates, e.g. "offer_type, count(*), avg(reply_rate)"' },
        filters: filterSchema,
        group_by: { type: Type.STRING, description: "Column to group by" },
      },
      required: ["table", "select"],
    },
  },
];

async function executeQuery(
  table: string,
  select: string,
  filters?: Array<{ column: string; op: string; value: string }>,
  orderBy?: string,
  ascending?: boolean,
  limit?: number
) {
  let query = supabase.from(table).select(select);

  if (filters) {
    for (const f of filters) {
      query = (query as any)[f.op](f.column, f.value);
    }
  }

  if (orderBy) {
    query = query.order(orderBy, { ascending: ascending ?? false });
  }

  query = query.limit(limit ?? 25);

  const { data, error } = await query;
  if (error) return { error: error.message };
  return { data, count: data?.length ?? 0 };
}

function handleToolCall(name: string, input: any): Promise<any> {
  const tableMap: Record<string, string> = {
    query_campaigns: "campaign_performance",
    query_subject_lines: "subject_line_performance",
    query_leads: "leads",
    query_contacts: "contact_search",
    query_sequence_steps: "sequence_steps",
    query_calendly_events: "calendly_events",
  };

  if (name === "aggregate_query") {
    return executeQuery(
      input.table,
      input.select,
      input.filters,
      undefined,
      undefined,
      100
    );
  }

  const table = tableMap[name];
  if (!table) return Promise.resolve({ error: `Unknown tool: ${name}` });

  return executeQuery(
    table,
    input.select,
    input.filters,
    input.order_by,
    input.ascending,
    input.limit
  );
}

export async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  apiKey: string
): Promise<string> {
  const genai = new GoogleGenAI({ apiKey });

  // Build Gemini tool declarations
  const toolDeclarations = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  // Build conversation history for Gemini format
  const geminiHistory = messages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1].content;

  // Create chat session
  const chat = genai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: toolDeclarations as unknown as FunctionDeclaration[] }],
    },
    history: geminiHistory,
  });

  let response = await (await chat).sendMessage({ message: lastMessage });

  // Tool-use loop — keep calling tools until we get a text response
  const MAX_TOOL_ROUNDS = 10;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) break;

    // Execute all function calls
    const functionResponses = [];
    for (const fc of functionCalls) {
      const result = await handleToolCall(fc.name!, fc.args as any);
      functionResponses.push({
        name: fc.name!,
        response: result,
      });
    }

    // Send function results back
    response = await (await chat).sendMessage({
      message: functionResponses.map((fr) => ({
        functionResponse: {
          name: fr.name,
          response: fr.response,
        },
      })),
    });
  }

  // Extract final text
  return response.text ?? "I wasn't able to generate a response. Please try rephrasing your question.";
}
