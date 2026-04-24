import { NextRequest, NextResponse } from "next/server";
import {
  flattenOutscraperPlaces,
  outscraperGoogleMapsSearch,
  postPlacesToClayWebhook,
} from "@/lib/outscraper-clay";

type Body = {
  query: string;
  limit?: number;
  skipPlaces?: number;
  coordinates?: string;
  async?: boolean;
  language?: string;
  region?: string;
  /** If true, after fetch, POST each place to this Clay webhook URL. */
  clayWebhookUrl?: string;
  /** Optional Clay webhook auth (if your table requires a token header). */
  clayAuthToken?: string;
  /** If true, use server env CLAY_LIST_WEBHOOK_URL when clayWebhookUrl omitted. */
  useDefaultClayWebhook?: boolean;
  /** Merged into every Clay row for routing (e.g. campaign creation context). */
  context?: {
    campaignName?: string;
    clientName?: string;
    clientId?: string;
    strategyId?: string;
    strategyName?: string;
    laneName?: string;
    offerName?: string;
    ideaName?: string;
  };
};

/**
 * POST /api/list-pipeline/outscraper-maps
 * Runs Outscraper Google Maps search; optionally sends rows to a Clay table webhook.
 */
export async function POST(req: NextRequest) {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OUTSCRAPER_API_KEY is not set on the server" },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const defaultClay = process.env.CLAY_LIST_WEBHOOK_URL?.trim();
  const targetWebhook = body.clayWebhookUrl?.trim() || (body.useDefaultClayWebhook && defaultClay ? defaultClay : undefined);

  try {
    const raw = await outscraperGoogleMapsSearch(key, {
      query: body.query,
      limit: body.limit,
      skipPlaces: body.skipPlaces,
      coordinates: body.coordinates,
      async: body.async,
      language: body.language,
      region: body.region,
      webhook: targetWebhook
        ? undefined
        : undefined, // Outscraper can callback to a URL, but we forward from our app for one Clay row shape
    });

    const o = raw as { status?: string; data?: unknown; id?: string; errorMessage?: string; results_location?: string };
    if (o.errorMessage) {
      return NextResponse.json({ error: o.errorMessage }, { status: 502 });
    }

    const isAsync = body.async !== false;
    if (isAsync && (o.status === "Pending" || o.id) && o.results_location) {
      return NextResponse.json({
        ok: true,
        mode: "async",
        outscraperRequestId: o.id,
        resultsLocation: o.results_location,
        message:
          "Outscraper accepted async job. Poll results_location or wait for email; then re-run with async:false for small limit or use Outscraper UI.",
        clayWebhook: targetWebhook ? "set but async job — forward places after you fetch results" : undefined,
      });
    }

    const places = flattenOutscraperPlaces(o.data);
    let clay: { ok: number; failed: number } | undefined;
    if (targetWebhook && places.length) {
      const token = body.clayAuthToken || process.env.CLAY_LIST_WEBHOOK_TOKEN;
      const ctx = body.context;
      const campaignContext: Record<string, string | null | undefined> | undefined = ctx
        ? {
            _flow: "campaign",
            _campaign_draft: ctx.campaignName,
            _client: ctx.clientName,
            _client_id: ctx.clientId,
            _strategy_id: ctx.strategyId,
            _strategy: ctx.strategyName,
            _lane: ctx.laneName,
            _offer: ctx.offerName,
            _idea: ctx.ideaName,
          }
        : undefined;
      clay = await postPlacesToClayWebhook(targetWebhook, places, {
        authToken: token,
        idempotencyKeyPrefix: `om-${o.id || Date.now()}`,
        campaignContext,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "sync",
      placeCount: places.length,
      sample: places[0] ?? null,
      clay: clay
        ? { sentOk: clay.ok, failed: clay.failed, webhookTarget: "configured" }
        : targetWebhook
          ? { sentOk: 0, message: "No rows to forward" }
          : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Outscraper failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
