"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
}

interface StrategyRow {
  id: string;
  name: string;
}

interface LaneRow {
  id: string;
  name: string;
}

interface OfferRow {
  id: string;
  name: string;
  one_liner: string;
  cta: string;
}

interface IdeaRow {
  id: string;
  name: string;
  targeting_level: "broad" | "focused" | "niche" | string;
}

/**
 * Minimal stub-creation page. Captures just enough to create a brief row, then
 * redirects into the full Module 1 wizard where the operator fills out the
 * real campaign brief.
 */
function NewCampaignBriefContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdFromUrl = searchParams.get("client_id") ?? "";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [name, setName] = useState("");

  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [strategyId, setStrategyId] = useState<string>("");
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [laneId, setLaneId] = useState<string>("");
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [offerId, setOfferId] = useState<string>("");
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [ideaId, setIdeaId] = useState<string>("");

  useEffect(() => {
    if (clientIdFromUrl) setClientId(clientIdFromUrl);
  }, [clientIdFromUrl]);

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

  // Load strategies when client changes
  useEffect(() => {
    if (!clientId) {
      setStrategies([]);
      setStrategyId("");
      setLanes([]);
      setLaneId("");
      setOffers([]);
      setOfferId("");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/campaign-tester/strategies?client_id=${encodeURIComponent(clientId)}`);
        const data = await res.json();
        setStrategies(data.strategies ?? []);
      } catch {
        setStrategies([]);
      }
    })();
  }, [clientId]);

  // Load lanes + offers when strategy changes
  useEffect(() => {
    if (!strategyId) {
      setLanes([]);
      setLaneId("");
      setOffers([]);
      setOfferId("");
      setIdeas([]);
      setIdeaId("");
      return;
    }
    (async () => {
      try {
        const [lr, or] = await Promise.all([
          fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/lanes`),
          fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/offers`),
        ]);
        const ldata = await lr.json();
        const odata = await or.json();
        setLanes(ldata.lanes ?? []);
        setOffers(odata.offers ?? []);
      } catch {
        setLanes([]);
        setOffers([]);
      }
    })();
  }, [strategyId]);

  // Load ideas when lane changes
  useEffect(() => {
    if (!strategyId || !laneId) {
      setIdeas([]);
      setIdeaId("");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/campaign-ideas?lane_id=${encodeURIComponent(laneId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load ideas");
        setIdeas(data.ideas ?? []);
      } catch {
        setIdeas([]);
      }
    })();
  }, [strategyId, laneId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    if (!clientId) {
      setError("Client is required for strategy-based campaigns.");
      return;
    }
    if (!strategyId) {
      setError("Pick a client strategy first.");
      return;
    }
    if (!laneId) {
      setError("Pick an ICP lane.");
      return;
    }
    if (!offerId) {
      setError("Pick an offer.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/campaign-tester/briefs/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          strategy_id: strategyId,
          lane_id: laneId,
          offer_id: offerId,
          campaign_name: name.trim(),
          idea_id: ideaId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create brief.");
        setSubmitting(false);
        return;
      }
      router.push(`/campaign-tester/${data.brief.id}/setup/brief`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSubmitting(false);
    }
  }

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> / New Brief
        </div>
        <div className="ct-header">
          <h1>New Campaign Brief</h1>
          <div className="ct-sub">
            Name the campaign and pick the client. You&apos;ll fill out the full brief in Module 1.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ct-card">
            <h2>Basics</h2>
            <div className="ct-grid2">
              <div className="ct-field">
                <label>Client</label>
                <select
                  className="ct-select"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Select a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.industry_vertical ? ` · ${c.industry_vertical}` : ""}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  New client?{" "}
                  <Link href="/clients/new" style={{ color: "var(--accent)" }}>
                    Onboard here first
                  </Link>
                  .
                </p>
              </div>
              <div className="ct-field">
                <label>Campaign name *</label>
                <input
                  className="ct-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. MSP lane A — offer 1"
                  required
                />
              </div>
            </div>
          </div>

          <div className="ct-card">
            <h2>Strategy → lane → offer</h2>
            <div className="ct-grid2">
              <div className="ct-field">
                <label>Client strategy *</label>
                <select
                  className="ct-select"
                  value={strategyId}
                  onChange={(e) => {
                    setStrategyId(e.target.value);
                    setLaneId("");
                    setOfferId("");
                  }}
                  disabled={!clientId}
                >
                  <option value="">Select a strategy…</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  No strategy yet? Create one in Client Strategy (coming next) or via API.
                </p>
              </div>
              <div className="ct-field">
                <label>ICP lane *</label>
                <select
                  className="ct-select"
                  value={laneId}
                  onChange={(e) => {
                    setLaneId(e.target.value);
                    setIdeaId("");
                  }}
                  disabled={!strategyId}
                >
                  <option value="">Select a lane…</option>
                  {lanes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ct-field">
                <label>Campaign idea (optional)</label>
                <select
                  className="ct-select"
                  value={ideaId}
                  onChange={(e) => setIdeaId(e.target.value)}
                  disabled={!strategyId || !laneId || ideas.length === 0}
                >
                  <option value="">No idea selected…</option>
                  {ideas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.targeting_level ? ` · ${i.targeting_level}` : ""}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Generate 15–25 ideas per lane in <Link href="/campaign-tester/strategy">Client Strategy</Link>, then pick one here.
                </p>
              </div>
              <div className="ct-field" style={{ gridColumn: "1 / -1" }}>
                <label>Offer *</label>
                <select
                  className="ct-select"
                  value={offerId}
                  onChange={(e) => setOfferId(e.target.value)}
                  disabled={!strategyId}
                >
                  <option value="">Select an offer…</option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && <div className="ct-alert ct-alert-block">{error}</div>}

          <div className="ct-actions">
            <Link href="/campaign-tester" className="btn">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create & open Module 1 →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewCampaignBriefPage() {
  return (
    <Suspense
      fallback={
        <div className="app-layout">
          <AppSidebar active="tester" />
          <div className="ct-shell">
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          </div>
        </div>
      }
    >
      <NewCampaignBriefContent />
    </Suspense>
  );
}
