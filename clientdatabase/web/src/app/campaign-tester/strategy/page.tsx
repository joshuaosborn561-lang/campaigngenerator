"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

type ClientRow = { id: string; name: string; industry_vertical: string | null };
type StrategyRow = {
  id: string;
  client_id: string;
  name: string;
  what_they_do: string | null;
  measurable_outcome: string | null;
  timeline_claim: string | null;
  named_results: string | null;
  core_pain: string | null;
};

type LaneRow = {
  id: string;
  strategy_id: string;
  name: string;
  description: string | null;
  titles: string[] | null;
  departments: string[] | null;
  industries: string[] | null;
  company_size: string | null;
  geography: string | null;
  exclusions: string[] | null;
  signals: string[] | null;
};

type OfferRow = {
  id: string;
  strategy_id: string;
  name: string;
  one_liner: string;
  cta: string;
  rationale: string | null;
  tags: string[] | null;
};

type WebsiteAnalysisRow = {
  id: string;
  strategy_id: string;
  website_url: string;
  summary: string | null;
  extracted: Record<string, unknown> | null;
  updated_at: string;
};

export default function ClientStrategyPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [strategyId, setStrategyId] = useState("");
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [analysis, setAnalysis] = useState<WebsiteAnalysisRow | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === strategyId) ?? null,
    [strategies, strategyId],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clients");
        const data = await res.json();
        setClients(data.clients ?? []);
      } catch {
        setClients([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!clientId) {
      setStrategies([]);
      setStrategyId("");
      setLanes([]);
      setOffers([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaign-tester/strategies?client_id=${encodeURIComponent(clientId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load strategies");
        setStrategies(data.strategies ?? []);
      } catch (e) {
        setStrategies([]);
        setError(e instanceof Error ? e.message : "Failed to load strategies");
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  useEffect(() => {
    if (!strategyId) {
      setLanes([]);
      setOffers([]);
      setAnalysis(null);
      setWebsiteUrl("");
      return;
    }
    (async () => {
      setError(null);
      try {
        const [lr, or] = await Promise.all([
          fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/lanes`),
          fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/offers`),
        ]);
        const ldata = await lr.json();
        const odata = await or.json();
        if (!lr.ok) throw new Error(ldata.error ?? "Failed to load lanes");
        if (!or.ok) throw new Error(odata.error ?? "Failed to load offers");
        setLanes(ldata.lanes ?? []);
        setOffers(odata.offers ?? []);
      } catch (e) {
        setLanes([]);
        setOffers([]);
        setError(e instanceof Error ? e.message : "Failed to load strategy details");
      }
    })();
  }, [strategyId]);

  useEffect(() => {
    if (!strategyId) return;
    (async () => {
      try {
        const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/website-analyze`, {
          method: "GET",
        });
        const data = await res.json();
        if (!res.ok) return;
        if (data.analysis) {
          setAnalysis(data.analysis as WebsiteAnalysisRow);
          setWebsiteUrl(String((data.analysis as any).website_url ?? ""));
        }
      } catch {
        // ignore
      }
    })();
  }, [strategyId]);

  async function createStrategy() {
    if (!clientId) return;
    const name = prompt("Strategy name (e.g. 'Core outbound system')")?.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch("/api/campaign-tester/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setStrategies((prev) => [data.strategy, ...prev]);
      setStrategyId(data.strategy.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function addLane() {
    if (!strategyId) return;
    const name = prompt("ICP lane name (e.g. 'MSP owners, 11–50')")?.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/strategies/${strategyId}/lanes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lane create failed");
      setLanes((prev) => [...prev, data.lane]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lane create failed");
    }
  }

  async function addOffer() {
    if (!strategyId) return;
    const name = prompt("Offer name (2–5 words, e.g. '30 days of labor')")?.trim();
    if (!name) return;
    const one_liner = prompt("One-liner (what they get)")?.trim() ?? "";
    const cta = prompt("CTA (reply ask)")?.trim() ?? "";
    if (!one_liner || !cta) {
      setError("Offer requires one_liner and cta.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/strategies/${strategyId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, one_liner, cta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Offer create failed");
      setOffers((prev) => [...prev, data.offer]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Offer create failed");
    }
  }

  async function analyzeWebsite() {
    if (!strategyId) return;
    const url = websiteUrl.trim();
    if (!url) {
      setError("Website URL is required.");
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const res = await fetch(
        `/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/website-analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website_url: url }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Website analysis failed");
      setAnalysis(data.analysis as WebsiteAnalysisRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Website analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function addLanesFromAnalysis() {
    if (!strategyId || !analysis?.extracted) return;
    const lanesAny = (analysis.extracted as any)?.proposed_icp_lanes;
    if (!Array.isArray(lanesAny) || lanesAny.length === 0) {
      setError("No proposed lanes found in analysis.");
      return;
    }
    setError(null);
    try {
      for (const pl of lanesAny.slice(0, 6)) {
        const res = await fetch(`/api/campaign-tester/strategies/${strategyId}/lanes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(pl.lane_name || "").trim() || "ICP lane",
            description: String(pl.description || "").trim() || null,
            titles: Array.isArray(pl.titles) ? pl.titles : [],
            departments: Array.isArray(pl.departments) ? pl.departments : [],
            industries: Array.isArray(pl.industries) ? pl.industries : [],
            company_size: typeof pl.company_size === "string" ? pl.company_size : null,
            geography: typeof pl.geography === "string" ? pl.geography : null,
            exclusions: Array.isArray(pl.exclusions) ? pl.exclusions : [],
            signals: Array.isArray(pl.signals) ? pl.signals : [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Lane create failed");
        setLanes((prev) => [...prev, data.lane]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add lanes from analysis");
    }
  }

  async function generateIdeasForLane(laneId: string) {
    if (!strategyId || !laneId) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/campaign-ideas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lane_id: laneId, overwrite: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Idea generation failed");
      alert(`Generated ${Array.isArray(data.ideas) ? data.ideas.length : 0} idea(s). Open New Campaign to pick one.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Idea generation failed");
    }
  }

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-header">
          <h1>Client Strategy</h1>
          <div className="ct-sub">
            Define the reusable outbound system (ICP lanes + offer library). Then spawn campaigns from it.
          </div>
        </div>

        <div className="ct-card">
          <h2>Pick client</h2>
          <div className="ct-grid2">
            <div className="ct-field">
              <label>Client</label>
              <select className="ct-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.industry_vertical ? ` · ${c.industry_vertical}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="ct-field">
              <label>Strategy</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="ct-select"
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value)}
                  style={{ flex: 1 }}
                  disabled={!clientId}
                >
                  <option value="">Select a strategy…</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button className="btn" type="button" onClick={createStrategy} disabled={!clientId}>
                  + New
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                After creating one, go to <Link href="/campaign-tester/new">New Campaign</Link> to spawn briefs.
              </p>
            </div>
          </div>
        </div>

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        {loading ? (
          <div className="ct-card">
            <div className="skeleton" style={{ width: "40%", marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "70%" }} />
          </div>
        ) : !activeStrategy ? (
          <div className="ct-card">
            <div className="empty-state" style={{ padding: 28 }}>
              <div className="empty-state-title">Select a strategy to edit lanes + offers</div>
              <div>Pick a client, create a strategy, then add ICP lanes and offers.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="ct-card">
              <h2>Website analysis (recommended)</h2>
              <p className="ct-sub">
                Start by analyzing the client website to propose ICP lanes and extract proof for campaign ideas.
              </p>
              <div className="ct-grid2">
                <div className="ct-field" style={{ gridColumn: "1 / -1" }}>
                  <label>Website URL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="ct-input"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://example.com"
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" type="button" onClick={analyzeWebsite} disabled={analyzing}>
                      {analyzing ? "Analyzing…" : "Analyze"}
                    </button>
                  </div>
                  {analysis?.summary ? (
                    <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Summary</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{analysis.summary}</div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn" type="button" onClick={addLanesFromAnalysis}>
                          + Add suggested lanes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                      Tip: after analyzing, use “Add suggested lanes” to create Midmarket / Enterprise lanes quickly.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="ct-card">
              <h2>ICP lanes</h2>
              <p className="ct-sub">
                Each lane is a distinct “who + why now” segment. You can have multiple lanes per client.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button className="btn" type="button" onClick={addLane}>
                  + Add lane
                </button>
              </div>
              {lanes.length === 0 ? (
                <div className="empty-state" style={{ padding: 18 }}>
                  <div className="empty-state-title">No lanes yet</div>
                  <div>Add at least one lane to spawn campaigns.</div>
                </div>
              ) : (
                <ul className="ct-list">
                  {lanes.map((l) => (
                    <li key={l.id}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ct-list-label">{l.name}</div>
                        <div className="ct-list-sub">
                          {[l.company_size, l.geography].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <div className="ct-list-sub" style={{ marginTop: 4 }}>
                          {(Array.isArray(l.titles) ? l.titles.slice(0, 4).join(", ") : "") || "—"}
                        </div>
                      </div>
                      <span className="ct-chip ct-chip-todo">lane</span>
                      <button className="btn" type="button" onClick={() => generateIdeasForLane(l.id)}>
                        Generate 15–25 ideas
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="ct-card">
              <h2>Offer library</h2>
              <p className="ct-sub">
                Generous, standalone offers (not audits by default). Pick one offer per spawned campaign.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button className="btn" type="button" onClick={addOffer}>
                  + Add offer
                </button>
              </div>
              {offers.length === 0 ? (
                <div className="empty-state" style={{ padding: 18 }}>
                  <div className="empty-state-title">No offers yet</div>
                  <div>Add at least one offer to spawn campaigns.</div>
                </div>
              ) : (
                <ul className="ct-list">
                  {offers.map((o) => (
                    <li key={o.id}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ct-list-label">{o.name}</div>
                        <div className="ct-list-sub">{o.one_liner}</div>
                      </div>
                      <Link className="btn" href={`/campaign-tester/new?client_id=${encodeURIComponent(clientId)}`}>
                        Use
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

