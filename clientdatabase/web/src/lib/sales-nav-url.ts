/**
 * Build LinkedIn Sales Navigator **People** search URLs.
 * LinkedIn does not publish a formal spec; the structure is derived from
 * in-app URLs. Test every generated link in Sales Nav before large campaigns.
 * @see https://www.linkedin.com/sales/search/people
 */

export const SALES_SN_US_COUNTRY: SalesNavGeo = {
  id: "103644278",
  text: "United States",
};

/**
 * U.S. states (sample) with geo ids cited in public Sales Nav URL writeups.
 * For any state not listed, set geography in Sales Nav once, copy the URL, and
 * use **Custom** region id + text on the List pipeline page, or add to this array.
 */
export const US_STATE_REGION_PRESETS: SalesNavGeo[] = [
  { id: "102095887", text: "California" },
  { id: "102571732", text: "Texas" },
  { id: "102513019", text: "Florida" },
  { id: "101165590", text: "New York" },
  { id: "100430514", text: "Pennsylvania" },
  { id: "101630962", text: "Illinois" },
  { id: "101833144", text: "Ohio" },
  { id: "105765268", text: "Georgia" },
  { id: "100323839", text: "North Carolina" },
  { id: "101509413", text: "Michigan" },
  { id: "103644278", text: "United States" },
];

/**
 * Company headcount (Sales Nav) — `id` is a letter code inside the LIS `query=`.
 * Public guides disagree on A–H mapping; verify a sample search in your account.
 * Example pattern from field guides: D/E often used for mid-market band pairs.
 */
export const SALES_HEADCOUNT_PRESETS: { id: string; text: string }[] = [
  { id: "A", text: "1-10" },
  { id: "B", text: "11-50" },
  { id: "C", text: "51-200" },
  { id: "D", text: "201-500" },
  { id: "E", text: "501-1,000" },
  { id: "F", text: "1,001-5,000" },
  { id: "G", text: "5,001-10,000" },
  { id: "H", text: "10,001+" },
];

export type SalesNavGeo = { id: string; text: string };
export type SalesNavHeadcount = { id: string; text: string };

export type BuildSalesNavPeopleInput = {
  /** Default true — omit only if you know the risk. */
  spellCorrectionEnabled?: boolean;
  /**
   * Geography filters. Usually one state or metro. LinkedIn may cap total
   * results; split (e.g. by state) to stay under the ~2.5k per-search ceiling.
   */
  regions: SalesNavGeo[];
  /**
   * One or more company headcount ranges.
   */
  headcount?: SalesNavHeadcount[];
  /**
   * Current job title / keyword chips (e.g. "VP of IT" or Boolean strings).
   */
  currentTitleTexts?: string[];
  /**
   * e.g. "C-Level", "Vice President" — requires LinkedIn’s internal value ids; pass full tuples
   * from a URL you copied, or use currentTitleTexts instead.
   */
  seniorityCustom?: { id: string; text: string }[];
  /** e.g. industry (need real industry id from a copied search). */
  industryCustom?: { id: string; text: string }[];
};

/**
 * Produces a single (type:REGION,values:List(...),...) block.
 * Inner text in LinkedIn’s query is often double-encoded in the final URL; we
 * use encodeURIComponent for the value after building the whole expression.
 */
function escapeTextForLis(s: string): string {
  return s.replace(/[(),]/g, (c) => (c === "," ? "" : c));
}

function valueTupleGeo(g: SalesNavGeo): string {
  const t = g.text.replace(/,/g, " ");
  return `(id:${g.id},text:${escapeTextForLis(t)},selectionType:INCLUDED)`;
}

function valueTupleHeadcount(h: SalesNavHeadcount): string {
  return `(id:${h.id},text:${h.text},selectionType:INCLUDED)`;
}

function valueTupleTextOnly(t: string): string {
  const one = t.trim().replace(/,/g, " ");
  return `(text:${one},selectionType:INCLUDED)`;
}

function valueTupleIdText(v: { id: string; text: string }): string {
  const tx = v.text.replace(/,/g, " ");
  return `(id:${v.id},text:${tx},selectionType:INCLUDED)`;
}

export function buildSalesNavPeopleQueryString(input: BuildSalesNavPeopleInput): string {
  if (!input.regions?.length) {
    throw new Error("At least one REGION (geo) is required to avoid unbounded people search.");
  }

  const filterParts: string[] = [];
  if (input.spellCorrectionEnabled !== false) {
    // spellCorrection is outside filters:List in the URL — see final assembly below
  }

  for (const r of input.regions) {
    filterParts.push(
      `(type:REGION,values:List(${valueTupleGeo(r)}))`
    );
  }

  if (input.headcount?.length) {
    const vals = input.headcount.map(valueTupleHeadcount).join(",");
    filterParts.push(`(type:COMPANY_HEADCOUNT,values:List(${vals}))`);
  }

  for (const t of input.currentTitleTexts ?? []) {
    if (t?.trim()) {
      filterParts.push(
        `(type:CURRENT_TITLE,values:List(${valueTupleTextOnly(t)}))`
      );
    }
  }

  for (const s of input.seniorityCustom ?? []) {
    filterParts.push(
      `(type:SENIORITY_LEVEL,values:List(${valueTupleIdText(s)}))`
    );
  }

  for (const ind of input.industryCustom ?? []) {
    filterParts.push(
      `(type:INDUSTRY,values:List(${valueTupleIdText(ind)}))`
    );
  }

  if (filterParts.length === 0) {
    throw new Error("No filters to apply.");
  }

  const sc = input.spellCorrectionEnabled !== false ? "spellCorrectionEnabled:true," : "";
  return `(${sc}filters:List(${filterParts.join(",")}))`;
}

export function buildSalesNavPeopleSearchUrl(input: BuildSalesNavPeopleInput): string {
  const raw = buildSalesNavPeopleQueryString(input);
  const param = encodeURIComponent(raw);
  return `https://www.linkedin.com/sales/search/people?query=${param}`;
}

/** Split a wide headcount+title+geo ICP into multiple URLs (e.g. one per state, one band + title). */
export function buildSalesNavShardPlan(opts: {
  stateRegions: SalesNavGeo[];
  headcount: SalesNavHeadcount[];
  currentTitleTexts: string[][];
}): { label: string; input: BuildSalesNavPeopleInput }[] {
  const { stateRegions, headcount, currentTitleTexts } = opts;
  if (!stateRegions.length) {
    return [];
  }
  const out: { label: string; input: BuildSalesNavPeopleInput }[] = [];
  for (const st of stateRegions) {
    for (const titleGroup of currentTitleTexts) {
      out.push({
        label: `${st.text} — ${titleGroup[0] ?? "titles"}`,
        input: {
          regions: [st],
          headcount: headcount.length ? headcount : undefined,
          currentTitleTexts: titleGroup.filter(Boolean),
        },
      });
    }
  }
  return out;
}

/** One Sales Nav URL per state (under ~2.5k cap per search). */
export function buildPerStatePeopleUrls(input: {
  states: SalesNavGeo[];
  headcount?: SalesNavHeadcount[];
  currentTitleTexts?: string[];
}): { label: string; url: string; queryRaw: string }[] {
  return input.states.map((st) => {
    const spec: BuildSalesNavPeopleInput = {
      regions: [st],
      headcount: input.headcount?.length ? input.headcount : undefined,
      currentTitleTexts: input.currentTitleTexts?.filter(Boolean),
    };
    return {
      label: st.text,
      url: buildSalesNavPeopleSearchUrl(spec),
      queryRaw: buildSalesNavPeopleQueryString(spec),
    };
  });
}
