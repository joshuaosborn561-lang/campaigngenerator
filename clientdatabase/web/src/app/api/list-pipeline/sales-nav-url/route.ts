import { NextRequest, NextResponse } from "next/server";
import {
  buildSalesNavPeopleQueryString,
  buildSalesNavPeopleSearchUrl,
  type BuildSalesNavPeopleInput,
} from "@/lib/sales-nav-url";

/**
 * POST /api/list-pipeline/sales-nav-url
 * Build a Sales Navigator people search URL from structured filters.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BuildSalesNavPeopleInput> & {
      /** Multi-shard: array of { regions, headcount?, currentTitleTexts? } */
      shards?: Partial<BuildSalesNavPeopleInput>[];
    };

    if (Array.isArray(body.shards) && body.shards.length) {
      const out: { label: string; url: string; queryRaw: string }[] = [];
      for (let i = 0; i < body.shards.length; i++) {
        const s = body.shards[i] as BuildSalesNavPeopleInput;
        if (!s?.regions?.length) {
          return NextResponse.json(
            { error: `shards[${i}]: regions required` },
            { status: 400 }
          );
        }
        const queryRaw = buildSalesNavPeopleQueryString(s);
        out.push({
          label: (s as { label?: string }).label || `Shard ${i + 1}`,
          url: buildSalesNavPeopleSearchUrl(s),
          queryRaw,
        });
      }
      return NextResponse.json({ ok: true, count: out.length, shards: out });
    }

    if (!body.regions?.length) {
      return NextResponse.json(
        { error: "regions: array of { id, text } required" },
        { status: 400 }
      );
    }

    const input: BuildSalesNavPeopleInput = {
      spellCorrectionEnabled: body.spellCorrectionEnabled,
      regions: body.regions,
      headcount: body.headcount,
      currentTitleTexts: body.currentTitleTexts,
      seniorityCustom: body.seniorityCustom,
      industryCustom: body.industryCustom,
    };
    const url = buildSalesNavPeopleSearchUrl(input);
    const queryRaw = buildSalesNavPeopleQueryString(input);
    return NextResponse.json({ ok: true, url, queryRaw });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
