"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SalesNavGeo, SalesNavHeadcount } from "@/lib/sales-nav-url";
import { buildPerStatePeopleUrls } from "@/lib/sales-nav-url";

type Presets = { usStates: SalesNavGeo[]; companyHeadcount: { id: string; text: string }[] };

export type ListPipelineContext = {
  campaignName?: string;
  clientName?: string;
  clientId?: string;
  strategyId?: string;
  strategyName?: string;
  laneName?: string;
  offerName?: string;
  ideaName?: string;
};

type ListPipelinePanelProps = {
  /**
   * When set, every Outscraper row posted to Clay includes this metadata
   * (for routing/segmentation in Clay).
   */
  outscraperContext?: ListPipelineContext;
  /**
   * `embedded` = shorter helper copy (e.g. on campaign new).
   * `standalone` = same copy as the full /list-pipeline page.
   */
  variant?: "embedded" | "standalone";
  /** Optional extra class on the root wrapper. */
  className?: string;
};

function copy(text: string) {
  void navigator.clipboard.writeText(text);
}

/**
 * Two-part list tooling: (1) Sales Nav people search URLs to paste into Clay,
 * (2) Outscraper Google Maps → optional Clay webhook.
 * Shared by /list-pipeline and campaign creation.
 */
export default function ListPipelinePanel({
  outscraperContext,
  variant = "standalone",
  className = "",
}: ListPipelinePanelProps) {
  const [presets, setPresets] = useState<Presets | null>(null);
  const [snStateIds, setSnStateIds] = useState<string[]>(["102571732"]);
  const [snTitle, setSnTitle] = useState("VP of IT");
  const [snHeadcountIds, setSnHeadcountIds] = useState<string[]>(["C", "D"]);
  const [customGeoId, setCustomGeoId] = useState("");
  const [customGeoText, setCustomGeoText] = useState("");
  const [snRows, setSnRows] = useState<{ label: string; url: string }[]>([]);
  const [snError, setSnError] = useState("");

  const [mapsQuery, setMapsQuery] = useState("roofing contractor, Austin, Texas, USA");
  const [mapsLimit, setMapsLimit] = useState(25);
  const [mapsResult, setMapsResult] = useState<string | null>(null);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [useDefaultClay, setUseDefaultClay] = useState(false);
  const [clayOverride, setClayOverride] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/list-pipeline/presets");
    const d = (await res.json()) as Presets;
    if (d.usStates) setPresets(d);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const selectedGeos: SalesNavGeo[] = useMemo(() => {
    const fromPresets = (presets?.usStates ?? []).filter((g) => snStateIds.includes(g.id));
    if (customGeoId.trim() && customGeoText.trim()) {
      return [...fromPresets, { id: customGeoId.trim(), text: customGeoText.trim() }];
    }
    return fromPresets;
  }, [presets, snStateIds, customGeoId, customGeoText]);

  const buildSn = useCallback(() => {
    setSnError("");
    try {
      if (!selectedGeos.length) {
        setSnRows([]);
        return;
      }
      const hc: SalesNavHeadcount[] = (presets?.companyHeadcount ?? [])
        .filter((h) => snHeadcountIds.includes(h.id));
      const titles = snTitle
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const rows = buildPerStatePeopleUrls({
        states: selectedGeos,
        headcount: hc.length ? hc : undefined,
        currentTitleTexts: titles.length ? titles : undefined,
      });
      setSnRows(rows.map((r) => ({ label: r.label, url: r.url })));
    } catch (e) {
      setSnError(e instanceof Error ? e.message : "Failed to build URLs");
    }
  }, [selectedGeos, presets, snTitle, snHeadcountIds]);

  useEffect(() => {
    buildSn();
  }, [buildSn]);

  const toggleState = (id: string) => {
    setSnStateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleHc = (id: string) => {
    setSnHeadcountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const runOutscraper = async () => {
    setMapsLoading(true);
    setMapsResult(null);
    try {
      const res = await fetch("/api/list-pipeline/outscraper-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: mapsQuery,
          limit: mapsLimit,
          async: false,
          region: "us",
          useDefaultClayWebhook: useDefaultClay,
          clayWebhookUrl: clayOverride.trim() || undefined,
          ...(outscraperContext && Object.values(outscraperContext).some(Boolean)
            ? { context: outscraperContext }
            : {}),
        }),
      });
      const j = (await res.json()) as { error?: string; placeCount?: number; sample?: unknown; clay?: unknown };
      if (!res.ok) {
        setMapsResult(j.error || `HTTP ${res.status}`);
        return;
      }
      setMapsResult(JSON.stringify(j, null, 2));
    } catch (e) {
      setMapsResult(e instanceof Error ? e.message : "Request failed");
    } finally {
      setMapsLoading(false);
    }
  };

  const intro = variant === "embedded"
    ? (
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          Build Sales Nav people URLs to paste into Clay, or run a hyper-local Google Maps search via
          Outscraper and forward rows to a Clay table webhook. Server needs{" "}
          <code>OUTSCRAPER_API_KEY</code>; optional <code>CLAY_LIST_WEBHOOK_URL</code> for
          &quot;Use env…&quot;. When you run from this campaign, Clay rows include client/strategy/lane/offer
          when those fields are filled above.
        </p>
      )
    : (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
          Sales Nav people URLs (for Clay) + Outscraper Google Maps → optional Clay webhook. Set{" "}
          <code>OUTSCRAPER_API_KEY</code> and (optional) <code>CLAY_LIST_WEBHOOK_URL</code> in Railway
          or <code>.env.local</code>.
        </p>
      );

  return (
    <div className={className}>
      {intro}

      <section style={{ marginBottom: 36, padding: 20, background: "var(--bg-secondary)", borderRadius: 8 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>1. LinkedIn Sales Navigator (people) URLs</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Paste a generated URL into your Clay Sales Nav source. Split by state to stay under
          ~2,500 results per search. <strong>Always open one link in Sales Nav to verify</strong> —
          geo/headcount ids are best-effort.
        </p>

        {presets ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>States (multi)</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 120,
                  overflow: "auto",
                  padding: 8,
                  background: "var(--bg-primary)",
                  borderRadius: 6,
                }}
              >
                {presets.usStates.map((s) => (
                  <label key={s.id} style={{ fontSize: 11, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={snStateIds.includes(s.id)}
                      onChange={() => toggleState(s.id)}
                      style={{ marginRight: 4 }}
                    />
                    {s.text}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Custom region (optional)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="filter-input"
                  style={{ minWidth: 100 }}
                  placeholder="Geo id (from copied Sales Nav URL)"
                  value={customGeoId}
                  onChange={(e) => setCustomGeoId(e.target.value)}
                />
                <input
                  className="filter-input"
                  style={{ minWidth: 180 }}
                  placeholder="Display e.g. Austin, Texas"
                  value={customGeoText}
                  onChange={(e) => setCustomGeoText(e.target.value)}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Company headcount (multi)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.companyHeadcount.map((h) => (
                  <label key={h.id} style={{ fontSize: 11, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={snHeadcountIds.includes(h.id)}
                      onChange={() => toggleHc(h.id)}
                      style={{ marginRight: 4 }}
                    />
                    {h.text} ({h.id})
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Current job titles / keywords (comma or newline)</div>
              <textarea
                className="filter-input"
                rows={3}
                value={snTitle}
                onChange={(e) => setSnTitle(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Loading presets…</p>
        )}
        {snError && <p style={{ color: "var(--red, #f87171)", fontSize: 13, marginTop: 8 }}>{snError}</p>}

        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
          {snRows.map((row) => (
            <li
              key={row.label + row.url.slice(0, 30)}
              style={{ marginBottom: 10, padding: 10, background: "var(--bg-primary)", borderRadius: 6 }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{row.label}</div>
              <div style={{ fontSize: 11, wordBreak: "break-all", color: "var(--text-secondary)" }}>{row.url}</div>
              <button type="button" className="btn" style={{ marginTop: 6, fontSize: 11 }} onClick={() => copy(row.url)}>
                Copy URL
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ padding: 20, background: "var(--bg-secondary)", borderRadius: 8 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>2. Outscraper (Google Maps) — API → optional Clay</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Uses the official <code>google-maps-search</code> API. For heavy pulls use{" "}
          <code>async: true</code> in the API body or run from the Outscraper dashboard. Default here
          is sync (small <code>limit</code>).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Query (e.g. hyper-local)</div>
            <input
              className="filter-input"
              value={mapsQuery}
              onChange={(e) => setMapsQuery(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}>
              Limit (1–500)
              <input
                type="number"
                className="filter-input"
                min={1}
                max={500}
                value={mapsLimit}
                onChange={(e) => setMapsLimit(Number(e.target.value) || 25)}
                style={{ width: 80, marginLeft: 8 }}
              />
            </label>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={useDefaultClay} onChange={(e) => setUseDefaultClay(e.target.checked)} />
              Use env <code>CLAY_LIST_WEBHOOK_URL</code> for each row
            </label>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Clay webhook URL (optional override)</div>
            <input
              className="filter-input"
              placeholder="https://… (table webhook from Clay → Sources → Webhook)"
              value={clayOverride}
              onChange={(e) => setClayOverride(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <button type="button" className="btn btn-primary" onClick={runOutscraper} disabled={mapsLoading}>
              {mapsLoading ? "Running…" : "Run Outscraper & forward to Clay"}
            </button>
          </div>
          {mapsResult && (
            <pre
              style={{
                fontSize: 10,
                overflow: "auto",
                maxHeight: 280,
                background: "var(--bg-primary)",
                padding: 10,
                borderRadius: 6,
              }}
            >
              {mapsResult}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
