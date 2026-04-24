"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";
import ListPipelinePanel, { type ListPipelineContext } from "@/components/list-pipeline-panel";

const WIZARD = [
  { n: 1, label: "Client" },
  { n: 2, label: "Name" },
  { n: 3, label: "Playbook" },
  { n: 4, label: "ICP lane" },
  { n: 5, label: "Offer" },
  { n: 6, label: "Idea" },
  { n: 7, label: "Lists + Clay" },
] as const;

const DEFAULT_STRATEGY_NAME = "Main strategy";

type WizardMode = "onboard" | "add-campaign";

type PastBrief = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

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
  const modeParam = searchParams.get("mode");
  const mode: WizardMode = modeParam === "add-campaign" ? "add-campaign" : "onboard";

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategyBootstrapping, setStrategyBootstrapping] = useState(false);
  const [pastBriefs, setPastBriefs] = useState<PastBrief[]>([]);
  const [loadingPastBriefs, setLoadingPastBriefs] = useState(false);

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

  // Inline "create" (lanes & offers only — strategy is auto-created as "Main strategy" when missing)
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

  // When adding another campaign, show prior briefs for context (no LLM "what worked" yet — that is a future pass)
  useEffect(() => {
    if (mode !== "add-campaign" || !clientId) {
      setPastBriefs([]);
      return;
    }
    (async () => {
      setLoadingPastBriefs(true);
      try {
        const res = await fetch(
          `/api/campaign-tester/briefs?client_id=${encodeURIComponent(clientId)}`
        );
        const data = await res.json();
        const rows: PastBrief[] = (data.briefs ?? []).map((b: PastBrief) => b);
        setPastBriefs(rows);
      } catch {
        setPastBriefs([]);
      } finally {
        setLoadingPastBriefs(false);
      }
    })();
  }, [mode, clientId]);

  // Load strategies; auto-create "Main strategy" if none (user never has to "create a strategy" manually)
  useEffect(() => {
    if (!clientId) {
      setStrategies([]);
      setStrategyId("");
      setStrategyBootstrapping(false);
      setLanes([]);
      setLaneId("");
      setOffers([]);
      setOfferId("");
      setIdeas([]);
      setIdeaId("");
      return;
    }
    (async () => {
      setStrategyBootstrapping(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaign-tester/strategies?client_id=${encodeURIComponent(clientId)}`);
        const data = await res.json();
        let list: StrategyRow[] = data.strategies ?? [];

        if (list.length === 0) {
          const ins = await fetch("/api/campaign-tester/strategies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId, name: DEFAULT_STRATEGY_NAME }),
          });
          const insJ = await ins.json();
          if (ins.ok && insJ.strategy) {
            list = [insJ.strategy as StrategyRow];
          } else if (!ins.ok) {
            setError(
              (insJ && insJ.error) || "Could not start a client playbook. Try Client Strategy in the nav."
            );
            list = [];
          }
        }

        setStrategies(list);
        if (strategyIdFromUrl && list.some((s) => s.id === strategyIdFromUrl)) {
          setStrategyId(strategyIdFromUrl);
        } else if (list.length === 1) {
          setStrategyId(list[0].id);
        } else {
          setStrategyId((prev) => (list.some((s) => s.id === prev) ? prev : ""));
        }
      } catch {
        setStrategies([]);
        setStrategyId("");
      } finally {
        setStrategyBootstrapping(false);
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
      3: Boolean(strategyId) && !strategyBootstrapping,
      4: Boolean(laneId),
      5: Boolean(offerId),
      6: true,
      7: Boolean(clientId) && name.trim() && strategyId && laneId && offerId,
    } as const;
  }, [clientId, name, strategyId, strategyBootstrapping, laneId, offerId]);

  const goNext = useCallback(() => {
    setError(null);
    if (step < 7) setStep((s) => Math.min(7, s + 1));
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => Math.max(1, s - 1));
  }, [step]);

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
          <h1>{mode === "add-campaign" ? "Add another campaign" : "Onboard: new client campaign"}</h1>
          <div className="ct-sub">
            {mode === "add-campaign" ? (
              <>
                Same flow as a first client, plus past briefs for this client. Offer / segment
                intelligence (what&apos;s working in reply data) is coming next; for now use your
                notes and the list below.
                {" "}
                <Link href="/campaign-tester/new" style={{ color: "var(--accent)" }}>New client</Link>{" "}
                (first-time) <Link href="/clients/new">or add a client</Link>
              </>
            ) : (
              <>
                The full vision: website → ICP (Gemini/Claude) → segments → offer variants → pick
                sends → this tool outputs lists + Clay. Today this wizard picks client, playbook,
                lane, offer, then list URLs / Outscraper; deep steps stay on{" "}
                <Link href="/campaign-tester/strategy">Client strategy</Link> until we wire the
                guided pipeline. No outreach API keys required until sync.
              </>
            )}
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
                New company? <Link href="/clients/new">Add a client</Link> (SmartLead / HeyReach keys
                are optional) — we&apos;ll use website + ICP from strategy before any sync keys.
              </p>
            </div>
            {mode === "add-campaign" && clientId && (
              <div
                className="ct-card"
                style={{ background: "var(--bg-tertiary)", marginTop: 14, padding: 12, border: "1px solid var(--border)" }}
              >
                <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px" }}>Previous campaigns (this client)</h3>
                {loadingPastBriefs ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
                ) : pastBriefs.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No briefs yet for this client.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--text-secondary)" }}>
                    {pastBriefs.slice(0, 8).map((b) => (
                      <li key={b.id} style={{ marginBottom: 4 }}>
                        <Link href={`/campaign-tester/${b.id}`}>{b.name}</Link>{" "}
                        <span style={{ color: "var(--text-muted)" }}>
                          — {b.status} · {new Date(b.created_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                    {pastBriefs.length > 8 ? <li>…and {pastBriefs.length - 8} more</li> : null}
                  </ul>
                )}
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
                  We will surface which offers/angles are over- or under-indexing on replies once
                  that pipeline is connected; for now, use this list to avoid duplicate angles.
                </p>
              </div>
            )}
            <div className="ct-wizard-nav">
              <span />
              <div className="ct-wizard-nav-spread">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canGo[1]}
                  onClick={goNext}
                >
                  {mode === "add-campaign" ? "Next — name this run" : "Next — name this campaign"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ct-card">
            <h2>Step 2 — What should we call this {mode === "add-campaign" ? "send" : "campaign"}?</h2>
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
                  Next — client playbook
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ct-card">
            <h2>Step 3 — Client playbook</h2>
            <p className="ct-wizard-help" style={{ marginTop: 4 }}>
              We keep ICP, offers, and website analysis on one playbook per client (auto-named{" "}
              <strong>Main strategy</strong> on first use). You don’t create or name it here — go
              to{" "}
              <Link href={clientId ? `/campaign-tester/strategy?client_id=${encodeURIComponent(clientId)}` : "/campaign-tester/strategy"}>Client strategy</Link> for website → Gemini pass, ICP
              chat, segments, and offer ideation. Multiple playbooks (e.g. upsell vs new logo) are
              rare: use the switch below if you have more than one.
            </p>
            {strategyBootstrapping && clientId && (
              <p className="ct-alert ct-alert-info" style={{ marginTop: 6 }}>
                Preparing playbook…
              </p>
            )}
            {activeStrategy && !strategyBootstrapping && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <strong>Active:</strong> {activeStrategy.name}
                {activeStrategy.what_they_do
                  ? ` — ${activeStrategy.what_they_do.slice(0, 160)}${
                      activeStrategy.what_they_do.length > 160 ? "…" : ""
                    }`
                  : " — add positioning and site analysis in Client strategy."}
              </p>
            )}
            {strategies.length > 1 ? (
            <div className="ct-field" style={{ maxWidth: 480 }}>
              <label>Switch playbook (if you have more than one)</label>
              <select
                className="ct-select"
                value={strategyId}
                onChange={(e) => {
                  setStrategyId(e.target.value);
                  setLaneId("");
                  setOfferId("");
                }}
                disabled={!clientId || strategyBootstrapping}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            ) : null}
            <p className="ct-card-sub" style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: "var(--text-muted)" }}>
              This campaign wizard is the short path to a brief + list URLs. The full
              <strong> first-client </strong> pipeline (site → ICP → segments → 15+ offer angles →
              per-segment sends → list tech) is implemented on Client strategy; we’ll merge the
              guided steps into one flow in a follow-up.
            </p>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
              <div className="ct-wizard-nav-spread">
                <Link
                  href={clientId ? `/campaign-tester/strategy?client_id=${encodeURIComponent(clientId)}` : "/campaign-tester/strategy"}
                  className="btn"
                  style={{ textDecoration: "none" }}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Client strategy
                </Link>
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
              <h2>Step 7 — Lists, Clay, then you push to sequencers</h2>
              <p className="ct-wizard-help" style={{ marginTop: 6 }}>
                Stops at list generation: use Sales Nav URLs in Clay, Outscraper rows to your
                table webhook, then you route in Clay/Sculptor to SmartLead/HeyReach (this app
                does not call sequencers). Save the campaign brief when you are ready to open
                the copy / testing track.
              </p>
              <details
                className="ct-card"
                style={{ marginBottom: 14, padding: 12, background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              >
                <summary style={{ fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  What to tell Clay / Sculptor in each table
                </summary>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.5 }}>
                  Use one inbound table (or a pair: people vs places) and branch from there. Each row
                  that came from this app or your webhook can carry:{" "}
                  <code>_source</code> (outscraper), <code>_ingested_at</code>, and context fields
                  <code> _client</code>, <code>_campaign_draft</code>, <code>_lane</code>, <code> _offer</code>, etc.
                  (when you run Outscraper from this wizard). The orchestration pattern we recommend:
                </p>
                <ol style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 0 18px", lineHeight: 1.6 }}>
                  <li>
                    <strong>Raw / inbound table</strong> — Sales Nav (via browser extension or
                    people scraper) or Outscraper JSON; do not add sequence logic here, only
                    source + segment tags.
                  </li>
                  <li>
                    <strong>Enrichment + filters</strong> — firmographics, title match to ICP, tech
                    and hiring signals; mark pass/fail to segment.
                  </li>
                  <li>
                    <strong>Sculptor (or automations)</strong> — for each <em>passing</em> segment,
                    assign campaign id / angle id from your runbook, then hand off email + LinkedIn
                    exports to the right SmartLead or HeyReach campaign. Keep one Clay table = one
                    logical list source; split by state or by query so each batch is under 2,500
                    (Sales Nav) or your Outscraper cap.
                  </li>
                </ol>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                  Your operators name exact Clay columns; we will add field mapping templates when
                  you share one workspace export.
                </p>
              </details>
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
                {submitting ? "Creating…" : "Create campaign brief & open Module 1 →"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 8 }}>
              <Link href="/list-pipeline">Open full list pipeline</Link> (same tools)
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
