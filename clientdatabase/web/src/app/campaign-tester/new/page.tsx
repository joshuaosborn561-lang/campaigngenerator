"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";
import ListPipelinePanel, { type ListPipelineContext } from "@/components/list-pipeline-panel";

const WIZARD = [
  { n: 1, label: "Client" },
  { n: 2, label: "Name" },
  { n: 3, label: "Strategy" },
  { n: 4, label: "ICP lane" },
  { n: 5, label: "Offer" },
  { n: 6, label: "Idea" },
  { n: 7, label: "List / launch" },
] as const;

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
}

interface StrategyRow {
  id: string;
  name: string;
  what_they_do?: string | null;
  measurable_outcome?: string | null;
}

interface LaneRow {
  id: string;
  name: string;
  description: string | null;
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

function NewCampaignBriefContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdFromUrl = searchParams.get("client_id") ?? "";
  const strategyIdFromUrl = searchParams.get("strategy_id") ?? "";

  const [step, setStep] = useState(1);
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

  // Inline "create" panels (one step at a time)
  const [newStrategyName, setNewStrategyName] = useState("");
  const [creatingStrategy, setCreatingStrategy] = useState(false);
  const [newLaneName, setNewLaneName] = useState("");
  const [newLaneDesc, setNewLaneDesc] = useState("");
  const [creatingLane, setCreatingLane] = useState(false);
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferLine, setNewOfferLine] = useState("");
  const [newOfferCta, setNewOfferCta] = useState("");
  const [creatingOffer, setCreatingOffer] = useState(false);

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

  // Load strategies when client changes; do not auto-pick (wizard controls selection)
  useEffect(() => {
    if (!clientId) {
      setStrategies([]);
      setStrategyId("");
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
        const res = await fetch(`/api/campaign-tester/strategies?client_id=${encodeURIComponent(clientId)}`);
        const data = await res.json();
        const list: StrategyRow[] = data.strategies ?? [];
        setStrategies(list);
        if (strategyIdFromUrl && list.some((s) => s.id === strategyIdFromUrl)) {
          setStrategyId(strategyIdFromUrl);
        } else {
          setStrategyId((prev) => (list.some((s) => s.id === prev) ? prev : ""));
        }
      } catch {
        setStrategies([]);
        setStrategyId("");
      }
    })();
  }, [clientId, strategyIdFromUrl]);

  // Load lanes + offers when strategy changes; clear child selections when strategy not in list
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
        // Reset picks if they no longer exist in new data
        setLaneId((prev) => (ldata.lanes?.some((l: LaneRow) => l.id === prev) ? prev : ""));
        setOfferId((prev) => (odata.offers?.some((o: OfferRow) => o.id === prev) ? prev : ""));
        setIdeaId("");
        setIdeas([]);
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

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === strategyId) ?? null,
    [strategies, strategyId]
  );

  const canGo = useMemo(() => {
    return {
      1: Boolean(clientId),
      2: name.trim().length > 0,
      3: Boolean(strategyId),
      4: Boolean(laneId),
      5: Boolean(offerId),
      6: true,
      7: Boolean(clientId) && name.trim() && strategyId && laneId && offerId,
    } as const;
  }, [clientId, name, strategyId, laneId, offerId]);

  const goNext = useCallback(() => {
    setError(null);
    if (step < 7) setStep((s) => Math.min(7, s + 1));
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => Math.max(1, s - 1));
  }, [step]);

  async function createStrategyInline() {
    if (!clientId || !newStrategyName.trim()) return;
    setCreatingStrategy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaign-tester/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, name: newStrategyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create strategy");
      setStrategies((prev) => [data.strategy, ...prev]);
      setStrategyId(data.strategy.id);
      setNewStrategyName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreatingStrategy(false);
    }
  }

  async function createLaneInline() {
    if (!strategyId || !newLaneName.trim()) return;
    setCreatingLane(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/lanes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLaneName.trim(),
          description: newLaneDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create lane");
      setLanes((prev) => [...prev, data.lane]);
      setLaneId(data.lane.id);
      setNewLaneName("");
      setNewLaneDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreatingLane(false);
    }
  }

  async function createOfferInline() {
    if (!strategyId) return;
    if (!newOfferName.trim() || !newOfferLine.trim() || !newOfferCta.trim()) {
      setError("Add offer name, one line, and CTA.");
      return;
    }
    setCreatingOffer(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOfferName.trim(),
          one_liner: newOfferLine.trim(),
          cta: newOfferCta.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create offer");
      setOffers((prev) => [...prev, data.offer]);
      setOfferId(data.offer.id);
      setNewOfferName("");
      setNewOfferLine("");
      setNewOfferCta("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreatingOffer(false);
    }
  }

  async function handleCreateBrief() {
    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    if (!clientId) {
      setError("Client is required.");
      return;
    }
    if (!strategyId) {
      setError("Select or create a strategy first.");
      return;
    }
    if (!laneId) {
      setError("Select or create an ICP lane first.");
      return;
    }
    if (!offerId) {
      setError("Select or create an offer first.");
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

  const outscraperContext: ListPipelineContext = useMemo(
    () => ({
      campaignName: name.trim() || undefined,
      clientName: clients.find((c) => c.id === clientId)?.name,
      clientId: clientId || undefined,
      strategyId: strategyId || undefined,
      strategyName: strategies.find((s) => s.id === strategyId)?.name,
      laneName: lanes.find((l) => l.id === laneId)?.name,
      offerName: offers.find((o) => o.id === offerId)?.name,
      ideaName: ideaId ? ideas.find((i) => i.id === ideaId)?.name : undefined,
    }),
    [name, clients, clientId, strategyId, strategies, laneId, lanes, offerId, offers, ideaId, ideas]
  );

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Testing Machine</Link> / New campaign
        </div>
        <div className="ct-header">
          <h1>Start a new campaign</h1>
          <div className="ct-sub">
            We&apos;ll go step by step. You don&apos;t need the answers upfront — each step explains
            the term and lets you add something if it is missing.
          </div>
        </div>

        <div className="ct-wizard" aria-label="Progress">
          <div className="ct-wizard-steps">
            {WIZARD.map((w) => {
              const done = w.n < step;
              const current = w.n === step;
              return (
                <span key={w.n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    className={
                      "ct-wizard-step-dot" +
                      (done ? " done" : "") +
                      (current ? " current" : "")
                    }
                    title={w.label}
                  >
                    {done ? "✓" : w.n}
                  </span>
                  {current ? (
                    <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{w.label}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        {step === 1 && (
          <div className="ct-card">
            <h2>Step 1 — Which client is this for?</h2>
            <p className="ct-wizard-help" style={{ marginTop: 8 }}>
              Everything we save (ICP, offers, lists) stays under this client. Pick the company you
              are running this outbound for.
            </p>
            <div className="ct-field" style={{ maxWidth: 420 }}>
              <label>Client *</label>
              <select
                className="ct-select"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  if (!e.target.value) setStrategyId("");
                }}
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
                New company? <Link href="/clients/new">Add a client</Link> first, then return here.
              </p>
            </div>
            <div className="ct-wizard-nav">
              <span />
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canGo[1]}
                  onClick={goNext}
                >
                  Next — name this campaign
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ct-card">
            <h2>Step 2 — What should we call this campaign?</h2>
            <p className="ct-wizard-help" style={{ marginTop: 8 }}>
              A short working title for this send (you can change it later). It helps you find this
              work in the list and in Clay or SmartLead notes.
            </p>
            <div className="ct-field" style={{ maxWidth: 420 }}>
              <label>Campaign name *</label>
              <input
                className="ct-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q2 IT directors — audit offer"
              />
            </div>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canGo[2]}
                  onClick={goNext}
                >
                  Next — pick strategy
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ct-card">
            <h2>Step 3 — What is a &ldquo;strategy&rdquo; here?</h2>
            <dl className="ct-wizard-dl">
              <dt>Strategy (client play)</dt>
              <dd>
                One &ldquo;playbook&rdquo; for this client: their positioning, your core proof, the
                offers you can run. A client can have several strategies (e.g. new logo vs
                upsell) — for most teams, one is enough to start.
              </dd>
            </dl>
            {activeStrategy && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Selected: <strong style={{ color: "var(--text-primary)" }}>{activeStrategy.name}</strong>
                {activeStrategy.what_they_do
                  ? ` — ${activeStrategy.what_they_do.slice(0, 120)}${activeStrategy.what_they_do.length > 120 ? "…" : ""}`
                  : ""}
              </p>
            )}
            <div className="ct-field" style={{ maxWidth: 480 }}>
              <label>Choose a strategy *</label>
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
                <option value="">Select one…</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {clientId && !strategies.length && (
              <p className="ct-alert ct-alert-info" style={{ marginTop: 8 }}>
                You don&apos;t have a strategy yet. Add a name below — you can add website analysis
                and offers on the <Link href={`/campaign-tester/strategy?client_id=${encodeURIComponent(clientId)}`}>Client Strategy</Link> page anytime.
              </p>
            )}
            <details className="ct-inline-form">
              <summary>Create a new strategy</summary>
              <div className="ct-inline-form-body">
                <div className="ct-field">
                  <label>Strategy name *</label>
                  <input
                    className="ct-input"
                    value={newStrategyName}
                    onChange={(e) => setNewStrategyName(e.target.value)}
                    placeholder="e.g. Core outbound 2026"
                    maxLength={200}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!newStrategyName.trim() || creatingStrategy}
                  onClick={createStrategyInline}
                >
                  {creatingStrategy ? "Saving…" : "Create and select"}
                </button>
              </div>
            </details>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
              Full website + lane builder: <Link href={`/campaign-tester/strategy?client_id=${encodeURIComponent(clientId || "")}`}>Client Strategy</Link> (open in a new tab if you prefer the big canvas).
            </p>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canGo[3]}
                  onClick={goNext}
                >
                  Next — who is the ICP?
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="ct-card">
            <h2>Step 4 — Who is this for? (ICP lane)</h2>
            <dl className="ct-wizard-dl">
              <dt>ICP lane</dt>
              <dd>
                One specific slice: titles, company size, geo, and department you want for{" "}
                <em>this</em> send. Examples: &ldquo;IT directors, 201–1k employees, US&rdquo; or
                &ldquo;VP Ops, midmarket manufacturing, South.&rdquo; You can have multiple lanes
                per strategy; pick the lane for this campaign.
              </dd>
            </dl>
            <div className="ct-field" style={{ maxWidth: 480 }}>
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
            {lanes.find((l) => l.id === laneId)?.description && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {lanes.find((l) => l.id === laneId)?.description}
              </p>
            )}
            <details className="ct-inline-form">
              <summary>Add a new ICP lane</summary>
              <div className="ct-inline-form-body">
                <div className="ct-field">
                  <label>Lane name *</label>
                  <input
                    className="ct-input"
                    value={newLaneName}
                    onChange={(e) => setNewLaneName(e.target.value)}
                    placeholder="e.g. Directors of IT, 50–200 seats, US"
                  />
                </div>
                <div className="ct-field">
                  <label>Notes (optional)</label>
                  <textarea
                    className="ct-textarea"
                    value={newLaneDesc}
                    onChange={(e) => setNewLaneDesc(e.target.value)}
                    rows={2}
                    placeholder="Titles, geo, excludes…"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!strategyId || !newLaneName.trim() || creatingLane}
                  onClick={createLaneInline}
                >
                  {creatingLane ? "Saving…" : "Create and select"}
                </button>
              </div>
            </details>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canGo[4]}
                  onClick={goNext}
                >
                  Next — which offer
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="ct-card">
            <h2>Step 5 — What are you leading with? (Offer)</h2>
            <dl className="ct-wizard-dl">
              <dt>Offer</dt>
              <dd>
                The hook you are testing: one line of value + a clear CTA. Same strategy can have
                different offers; pick the one for this campaign.
              </dd>
            </dl>
            <div className="ct-field" style={{ maxWidth: 480 }}>
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
            {offers.find((o) => o.id === offerId) && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {(offers.find((o) => o.id === offerId) as OfferRow).one_liner}
                {" → "}
                <em>{(offers.find((o) => o.id === offerId) as OfferRow).cta}</em>
              </p>
            )}
            <details className="ct-inline-form">
              <summary>Add a new offer</summary>
              <div className="ct-inline-form-body">
                <div className="ct-field">
                  <label>Offer name *</label>
                  <input
                    className="ct-input"
                    value={newOfferName}
                    onChange={(e) => setNewOfferName(e.target.value)}
                    placeholder="e.g. Free infrastructure audit"
                  />
                </div>
                <div className="ct-field">
                  <label>One-liner (value) *</label>
                  <input
                    className="ct-input"
                    value={newOfferLine}
                    onChange={(e) => setNewOfferLine(e.target.value)}
                    placeholder="What they get in one line"
                  />
                </div>
                <div className="ct-field">
                  <label>CTA *</label>
                  <input
                    className="ct-input"
                    value={newOfferCta}
                    onChange={(e) => setNewOfferCta(e.target.value)}
                    placeholder="e.g. 15 min call to review findings"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!strategyId || creatingOffer}
                  onClick={createOfferInline}
                >
                  {creatingOffer ? "Saving…" : "Create and select"}
                </button>
              </div>
            </details>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canGo[5]}
                  onClick={goNext}
                >
                  Next — campaign idea (optional)
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="ct-card">
            <h2>Step 6 — Campaign idea (optional)</h2>
            <p className="ct-wizard-help" style={{ marginTop: 0 }}>
              If you already generated ideas for this ICP lane in <strong>Client Strategy</strong>, you
              can attach one. Otherwise skip — you can add ideas later.
            </p>
            <div className="ct-field" style={{ maxWidth: 480 }}>
              <label>Pick an idea (optional)</label>
              <select
                className="ct-select"
                value={ideaId}
                onChange={(e) => setIdeaId(e.target.value)}
                disabled={!strategyId || !laneId || ideas.length === 0}
              >
                <option value="">None — skip for now</option>
                {ideas.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.targeting_level ? ` · ${i.targeting_level}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {(!ideas.length && strategyId && laneId) && (
              <p className="ct-alert ct-alert-info" style={{ marginTop: 8 }}>
                No ideas for this lane yet. From{" "}
                <Link href={`/campaign-tester/strategy?client_id=${encodeURIComponent(clientId)}`}>
                  Client Strategy
                </Link>{" "}
                you can run website analysis and generate 15–25 ideas per lane — or continue without
                one.
              </p>
            )}
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={goNext}
                >
                  Next — list tools & launch
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 7 && (
          <>
            <div className="ct-card">
              <h2>Step 7 — List building and launch</h2>
              <p className="ct-wizard-help" style={{ marginTop: 6 }}>
                Build Sales Nav URLs (paste into Clay) or run a small Outscraper pull below. When you
                are ready, create the campaign brief to open the full copy/testing wizard (Module
                1).
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 12,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span>
                  <strong>Client:</strong> {clients.find((c) => c.id === clientId)?.name ?? "—"}
                </span>
                <span>·</span>
                <span>
                  <strong>Campaign:</strong> {name.trim() || "—"}
                </span>
                <span>·</span>
                <span>
                  <strong>Strategy:</strong> {activeStrategy?.name ?? "—"}
                </span>
                <span>·</span>
                <span>
                  <strong>Lane:</strong> {lanes.find((l) => l.id === laneId)?.name ?? "—"}
                </span>
                <span>·</span>
                <span>
                  <strong>Offer:</strong> {offers.find((o) => o.id === offerId)?.name ?? "—"}
                </span>
                {ideaId ? (
                  <>
                    <span>·</span>
                    <span>
                      <strong>Idea:</strong> {ideas.find((i) => i.id === ideaId)?.name}
                    </span>
                  </>
                ) : null}
              </div>
              <ListPipelinePanel
                className="list-pipeline-embedded"
                variant="embedded"
                outscraperContext={outscraperContext}
              />
            </div>
            <div className="ct-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canGo[7] || submitting}
                onClick={handleCreateBrief}
              >
                {submitting ? "Creating…" : "Create campaign brief & continue →"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 8 }}>
              <Link href="/list-pipeline">Open full list pipeline</Link> in a separate view
            </p>
          </>
        )}
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
