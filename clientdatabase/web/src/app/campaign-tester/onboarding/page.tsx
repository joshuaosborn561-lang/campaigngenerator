"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";
import ListPipelinePanel, { type ListPipelineContext } from "@/components/list-pipeline-panel";
import OnboardingClaudePanel from "@/components/onboarding-claude-panel";

const DEFAULT_STRATEGY = "Main strategy";

type Onboarding = {
  website_url?: string;
  decision_maker_hypothesis?: string;
  firmographics_notes?: string;
  offer_notes?: string;
  technographics_signals?: string;
};

type Client = { id: string; name: string; industry_vertical: string | null };
type Strategy = {
  id: string;
  name: string;
  constraints?: Record<string, unknown> | null;
  what_they_do?: string | null;
};

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="app-layout app-layout--onboarding-light">
          <AppSidebar active="tester" />
          <div className="ct-shell">
            <p className="onb-light-muted">Loading…</p>
          </div>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

const STEPS = [
  "Name + website",
  "Website (Gemini)",
  "ICP: who decides",
  "Segments (firmographics)",
  "Offer + signals",
  "Launch + Clay lists",
] as const;

function normalizeWebsiteUrl(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function OnboardingContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const preClient = sp.get("client_id") ?? "";

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);

  const [onb, setOnb] = useState<Onboarding>({});

  const [newClientName, setNewClientName] = useState("");
  const [newClientUrl, setNewClientUrl] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  const [lanes, setLanes] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [offers, setOffers] = useState<{ id: string; name: string; one_liner: string; cta: string }[]>([]);
  const [ideas, setIdeas] = useState<{ id: string; name: string }[]>([]);
  const [laneId, setLaneId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [ideaId, setIdeaId] = useState("");
  const [campaignName, setCampaignName] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/clients");
      const d = await res.json();
      setClients(d.clients ?? []);
    })();
  }, []);

  useEffect(() => {
    if (preClient) {
      setClientId(preClient);
    }
  }, [preClient]);

  useEffect(() => {
    if (preClient) {
      setStep(2);
    }
  }, [preClient]);

  const loadStrategy = useCallback(
    async (cid: string, options?: { seedWebsiteUrl?: string; advanceToStep?: number }) => {
      if (!cid) {
        setStrategy(null);
        setOnb({});
        return;
      }
      const res = await fetch(`/api/campaign-tester/strategies?client_id=${encodeURIComponent(cid)}`);
      const data = await res.json();
      let list: Strategy[] = data.strategies ?? [];
      if (list.length === 0) {
        const ins = await fetch("/api/campaign-tester/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: cid, name: DEFAULT_STRATEGY }),
        });
        const insJ = await ins.json();
        if (ins.ok && insJ.strategy) {
          list = [insJ.strategy as Strategy];
        } else {
          setError((insJ && insJ.error) || "Could not create Main strategy");
          return;
        }
      }
      const s = list[0]!;
      setStrategy(s);
      const cons = s.constraints as Record<string, unknown> | undefined;
      const wiz = cons && typeof cons.salesglider_wizard === "object" ? (cons.salesglider_wizard as Record<string, unknown>) : null;
      const fromDb = (wiz?.data && typeof wiz.data === "object" ? wiz.data : {}) as Onboarding;
      if (options?.seedWebsiteUrl) {
        const merged: Onboarding = { ...fromDb, website_url: options.seedWebsiteUrl };
        setOnb(merged);
        await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(s.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            onboarding: merged,
            onboarding_step: options.advanceToStep ?? 2,
            onboarding_complete: false,
          }),
        });
        if (options.advanceToStep) setStep(options.advanceToStep);
        const sRes = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(s.id)}`);
        const sJson = await sRes.json();
        if (sRes.ok && sJson.strategy) setStrategy(sJson.strategy as Strategy);
      } else {
        if (Object.keys(fromDb).length) {
          setOnb(fromDb);
        } else {
          setOnb({});
        }
        const wstep = typeof wiz?.step === "number" ? wiz.step : null;
        if (typeof wstep === "number" && wstep >= 1 && wstep <= STEPS.length) {
          // Legacy: step 1 was "pick client". If we have a site URL, resume at website analysis.
          let resume = wstep === 1 && fromDb.website_url?.trim() ? 2 : wstep;
          // Deep link ?client_id=... should land on website analysis, not the "new client" form.
          if (preClient && cid === preClient && wstep === 1) {
            resume = 2;
          }
          setStep(resume);
        }
        if (options?.advanceToStep) setStep(options.advanceToStep);
      }
      try {
        const ar = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(s.id)}/website-analyze`);
        const aj = await ar.json();
        if (aj.analysis?.summary) {
          setAnalysisSummary(String(aj.analysis.summary));
        } else {
          setAnalysisSummary(null);
        }
      } catch {
        setAnalysisSummary(null);
      }
    },
    [setError, preClient]
  );

  async function continueFromNewClientStep() {
    const name = newClientName.trim();
    const url = normalizeWebsiteUrl(newClientUrl);
    if (!name) {
      setError("Add the company or client name.");
      return;
    }
    if (!url) {
      setError("Add the client’s website (we’ll use it in the next step for analysis).");
      return;
    }
    setCreatingClient(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes: `Onboarding — website: ${url}` }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Could not create client. Try a different name if this one exists.");
        return;
      }
      const row = d.client as { id: string; name: string; industry_vertical: string | null };
      setClientId(row.id);
      setClients((prev) => {
        if (prev.some((c) => c.id === row.id)) {
          return prev.map((c) => (c.id === row.id ? { ...c, name: row.name, industry_vertical: row.industry_vertical } : c));
        }
        return [row, ...prev];
      });
      await loadStrategy(row.id, { seedWebsiteUrl: url, advanceToStep: 2 });
    } catch {
      setError("Network error creating client.");
    } finally {
      setCreatingClient(false);
    }
  }

  useEffect(() => {
    void (async () => {
      if (!clientId) return;
      setError(null);
      await loadStrategy(clientId);
    })();
  }, [clientId, loadStrategy]);

  const refetchLanesAndOffers = useCallback(async () => {
    if (!strategy?.id) {
      setLanes([]);
      setOffers([]);
      return;
    }
    const [lr, of] = await Promise.all([
      fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/lanes`).then((r) => r.json()),
      fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/offers`).then((r) => r.json()),
    ]);
    setLanes(lr.lanes ?? []);
    setOffers(of.offers ?? []);
  }, [strategy?.id]);

  useEffect(() => {
    void refetchLanesAndOffers();
  }, [refetchLanesAndOffers]);

  useEffect(() => {
    if (!strategy?.id || !laneId) {
      setIdeas([]);
      setIdeaId("");
      return;
    }
    (async () => {
      const res = await fetch(
        `/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/campaign-ideas?lane_id=${encodeURIComponent(laneId)}`
      );
      const d = await res.json();
      setIdeas((d.ideas ?? []).map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })));
    })();
  }, [strategy?.id, laneId]);

  const persistOnboarding = async (next: Partial<Onboarding>, nextStep?: number) => {
    if (!strategy?.id) return;
    const merged: Onboarding = { ...onb, ...next };
    setOnb(merged);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding: merged,
          onboarding_step: nextStep ?? step,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      const d = await res.json();
      setStrategy(d.strategy as Strategy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runWebsiteAnalyze = async () => {
    if (!strategy?.id || !onb.website_url?.trim()) {
      setError("Add a website URL first.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/website-analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website_url: onb.website_url.trim() }),
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Analysis failed");
      if (d.analysis?.summary) setAnalysisSummary(d.analysis.summary);
      await loadStrategy(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const addSuggestedLanes = async () => {
    if (!strategy?.id) return;
    const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/website-analyze`);
    const d = await res.json();
    const ex = d.analysis?.extracted;
    const lanesAny = (ex as any)?.proposed_icp_lanes;
    if (!Array.isArray(lanesAny) || lanesAny.length === 0) {
      setError("Re-run website analysis, or add lanes in Client strategy.");
      return;
    }
    for (const pl of lanesAny.slice(0, 5)) {
      await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/lanes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String((pl as any).lane_name || "ICP segment").trim(),
          description: (pl as any).description,
          titles: (pl as any).titles,
          industries: (pl as any).industries,
          company_size: (pl as any).company_size,
          geography: (pl as any).geography,
        }),
      });
    }
    const lr = await fetch(
      `/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/lanes`
    ).then((r) => r.json());
    setLanes(lr.lanes ?? []);
  };

  const generateIdeas = async () => {
    if (!strategy?.id || !laneId) return;
    setError(null);
    const res = await fetch(
      `/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}/campaign-ideas`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane_id: laneId, overwrite: true }),
      }
    );
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Idea gen failed (need ANTHROPIC_API_KEY for Claude).");
      return;
    }
    setIdeas((d.ideas ?? []).map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })));
  };

  const spawn = async () => {
    if (!strategy?.id || !laneId || !offerId || !campaignName.trim()) {
      setError("Pick a lane, offer, and campaign name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/campaign-tester/briefs/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          strategy_id: strategy.id,
          lane_id: laneId,
          offer_id: offerId,
          campaign_name: campaignName.trim(),
          idea_id: ideaId || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Spawn failed");
      await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategy.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding: onb, onboarding_step: 6, onboarding_complete: true }),
      });
      router.push(`/campaign-tester/${d.brief.id}/setup/brief`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spawn failed");
    } finally {
      setSaving(false);
    }
  };

  const ctx: ListPipelineContext = {
    clientName: clients.find((c) => c.id === clientId)?.name,
    clientId: clientId || undefined,
    strategyName: strategy?.name,
    strategyId: strategy?.id,
    laneName: lanes.find((l) => l.id === laneId)?.name,
    offerName: offers.find((o) => o.id === offerId)?.name,
    campaignName: campaignName || undefined,
    ideaName: ideaId ? ideas.find((i) => i.id === ideaId)?.name : undefined,
  };

  return (
    <div className="app-layout app-layout--onboarding-light">
      <AppSidebar active="tester" />
      <div className="ct-shell" style={{ maxWidth: 820 }}>
        <div className="ct-crumbs onb-light-crumbs">
          <Link className="onb-light-link" href="/campaign-tester">
            Campaign testing machine
          </Link>{" "}
          / New client (guided)
        </div>
        <div className="ct-header">
          <h1 className="onb-light-h1">New client — guided setup</h1>
          <div className="ct-sub onb-light-sub">
            No SmartLead or HeyReach keys required until you want sync. Website and ICP work use
            server-side keys (Gemini, Claude) only. After this you copy lists to Clay, enrich, then
            push to your sequencers.{" "}
            <Link className="onb-light-link" href="/campaign-tester/new?mode=add-campaign">
              Already onboarded? Add a campaign
            </Link>
          </div>
        </div>
        {error && <div className="ct-alert ct-alert-block">{error}</div>}
        <div className="ct-wizard" style={{ marginBottom: 16 }}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const on = n === step;
            return (
              <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6 }}>
                <span className={"ct-wizard-step-dot" + (n < step ? " done" : on ? " current" : "")}>
                  {n < step ? "✓" : n}
                </span>
                {on ? (
                  <span className="onb-light-wizard-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    {label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <div className="ct-card">
            <h2>1 — New client: name + website</h2>
            <p className="ct-wizard-help">Start here to onboard. No SmartLead, HeyReach, or Clay API keys in this step.</p>
            <div className="ct-field" style={{ maxWidth: 400 }}>
              <label>Client name *</label>
              <input
                className="ct-input"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="e.g. Acme Corp"
                autoFocus
              />
            </div>
            <div className="ct-field" style={{ maxWidth: 400 }}>
              <label>Client website (public) *</label>
              <input
                className="ct-input"
                value={newClientUrl}
                onChange={(e) => setNewClientUrl(e.target.value)}
                placeholder="e.g. acmecorp.com or https://…"
              />
            </div>
            {clients.length > 0 && (
              <div className="ct-field" style={{ maxWidth: 400, marginTop: 8 }}>
                <label>Or continue with an existing client</label>
                <select
                  className="ct-select"
                  value={clientId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setClientId(id);
                    if (id) setStep(2);
                  }}
                >
                  <option value="">Select…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="ct-wizard-help" style={{ marginTop: 6 }}>
                  Picks a client you already have and goes to website analysis. Use the fields above for a new client.
                </p>
              </div>
            )}
            <div className="ct-wizard-nav" style={{ marginTop: 16 }}>
              <span />
              <button
                type="button"
                className="btn btn-primary"
                onClick={continueFromNewClientStep}
                disabled={!newClientName.trim() || !newClientUrl.trim() || creatingClient}
              >
                {creatingClient ? "Creating client…" : "Next — analyze website"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && strategy && (
          <div className="ct-card">
            <h2>2 — Website (Gemini analysis)</h2>
            <p className="ct-wizard-help">
              We pull the public site and run a structured extract (ICP seeds, value prop, proof).
              This does not use your Clay or SmartLead.
            </p>
            <div className="ct-field">
              <label>Client website *</label>
              <input
                className="ct-input"
                value={onb.website_url ?? ""}
                onChange={(e) => setOnb((o) => ({ ...o, website_url: e.target.value }))}
                placeholder="https://"
              />
            </div>
            {analysisSummary && (
              <div className="ct-card onb-light-nested-box" style={{ marginTop: 10, padding: 12, fontSize: 12 }}>
                <strong>Last summary</strong>
                <p style={{ margin: "6px 0 0" }}>{analysisSummary}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={runWebsiteAnalyze} disabled={analyzing || saving}>
                {analyzing ? "Analyzing…" : "Run website analysis (Gemini)"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await persistOnboarding(
                    { website_url: onb.website_url?.trim() || undefined },
                    3
                  );
                  setStep(3);
                }}
                disabled={!onb.website_url?.trim() || saving}
              >
                Next — ICP
              </button>
            </div>
            <p className="onb-light-fineprint">
              Claude (decision-maker hypothesis) in the next step. Full editing also lives in{" "}
              <Link
                className="onb-light-link"
                href={clientId ? `/campaign-tester/strategy?client_id=${clientId}` : "/campaign-tester/strategy"}
              >
                Client strategy
              </Link>
              .
            </p>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
            </div>
          </div>
        )}

        {step === 3 && strategy?.id && (
          <div className="ct-card">
            <h2>3 — Who is the decision maker? (Claude)</h2>
            <p className="ct-wizard-help">
              Use the chat to refine ICP in real time—who signs, who blocks, and which titles to
              target. When you like Claude&apos;s take, copy it into the field below.
            </p>
            <OnboardingClaudePanel
              strategyId={strategy.id}
              mode="icp"
              title="Chat: decision maker & buyer map"
              help="Go back and forth with Claude. Ask for rewrites, narrower titles, or blockers. Then click “Use latest” to paste the reply into the hypothesis field."
              applyLabel="Use latest Claude reply in hypothesis"
              onApplyText={(t) => setOnb((o) => ({ ...o, decision_maker_hypothesis: t }))}
            />
            <div className="ct-field" style={{ marginTop: 16 }}>
              <label>Hypothesis (edit after chat — or write freehand)</label>
              <textarea
                className="ct-textarea"
                rows={5}
                value={onb.decision_maker_hypothesis ?? ""}
                onChange={(e) => setOnb((o) => ({ ...o, decision_maker_hypothesis: e.target.value }))}
                placeholder="e.g. IT Director in 200–1k FTE, budget owner is CIO for security spend…"
              />
            </div>
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={() => setStep(2)}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await persistOnboarding(
                    { decision_maker_hypothesis: onb.decision_maker_hypothesis },
                    4
                  );
                  setStep(4);
                }}
                disabled={saving}
              >Next</button>
            </div>
          </div>
        )}

        {step === 4 && strategy?.id && (
          <div className="ct-card">
            <h2>4 — Firmographics & ICP segments (Claude + lanes)</h2>
            <p className="ct-wizard-help">
              Chat with Claude until you are happy with your segments, then <strong>Save segments to strategy</strong> to
              create ICP lane rows. You can still add quick lanes from the website analysis below.
            </p>
            <OnboardingClaudePanel
              strategyId={strategy.id}
              mode="lanes"
              title="Chat: firmographic segments"
              help="Propose, merge, and cut segments. When the conversation matches what you want, save—lanes appear in the list and in step 6 for list building."
              onFinalized={() => {
                void refetchLanesAndOffers();
              }}
              finalizeLabel="Save segments to strategy (replaces previous lanes from wizard)"
            />
            <div className="ct-field" style={{ marginTop: 16 }}>
              <label>Segment notes (optional scratchpad — also saved to wizard state)</label>
              <textarea
                className="ct-textarea"
                rows={4}
                value={onb.firmographics_notes ?? ""}
                onChange={(e) => setOnb((o) => ({ ...o, firmographics_notes: e.target.value }))}
              />
            </div>
            {lanes.length === 0 && (
              <p className="ct-alert ct-alert-info" style={{ marginTop: 8 }}>
                No lanes in the strategy yet. Use the chat and save, or add from website, or in{" "}
                <Link
                  className="onb-light-link"
                  href={clientId ? `/campaign-tester/strategy?client_id=${clientId}` : "/campaign-tester/strategy"}
                >
                  Client strategy
                </Link>
                .
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={addSuggestedLanes} disabled={!strategy?.id}>
                Add suggested lanes from website
              </button>
            </div>
            {lanes.length > 0 && (
              <ul className="ct-list" style={{ marginTop: 10 }}>
                {lanes.map((l) => (
                  <li key={l.id} style={{ flexDirection: "column", alignItems: "flex-start" }}>
                    <strong>{l.name}</strong>
                    <span className="ct-list-sub">{l.description}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={() => setStep(3)}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await persistOnboarding(
                    { firmographics_notes: onb.firmographics_notes },
                    5
                  );
                  setStep(5);
                }}
                disabled={saving}
              >Next</button>
            </div>
          </div>
        )}

        {step === 5 && strategy?.id && (
          <div className="ct-card">
            <h2>5 — Offer angles (15) + signals (Claude)</h2>
            <p className="ct-wizard-help">
              Work through <strong>15 offer angles</strong> with Claude—ask for rewrites, mergers, or sharper hooks.
              When the set feels right, save to your strategy. Then add signal notes for Clay/Sculptor.
            </p>
            <OnboardingClaudePanel
              strategyId={strategy.id}
              mode="offers"
              title="Chat: 15 offer angles"
              help="Say which angles to keep, drop, or merge. If you are happy with fewer, ask Claude to suggest more to reach 15, then save."
              onFinalized={() => {
                void refetchLanesAndOffers();
              }}
              finalizeLabel="Save 15 offer angles to strategy (replaces previous offers from wizard)"
            />
            <div className="ct-field" style={{ marginTop: 16 }}>
              <label>Offer / angle notes (optional scratchpad)</label>
              <textarea
                className="ct-textarea"
                rows={3}
                value={onb.offer_notes ?? ""}
                onChange={(e) => setOnb((o) => ({ ...o, offer_notes: e.target.value }))}
                placeholder="Hooks, risk-reversal, proof, constraints…"
              />
            </div>
            <div className="ct-field">
              <label>Signal notes (Stack, job posts, etc.) for Clay</label>
              <textarea
                className="ct-textarea"
                rows={3}
                value={onb.technographics_signals ?? ""}
                onChange={(e) => setOnb((o) => ({ ...o, technographics_signals: e.target.value }))}
              />
            </div>
            {offers.length > 0 && (
              <p className="onb-light-body">
                Offer library: {offers.length} in Main strategy. Deeper editing:{" "}
                <Link
                  className="onb-light-link"
                  href={clientId ? `/campaign-tester/strategy?client_id=${clientId}` : "/campaign-tester/strategy"}
                >
                  Client strategy
                </Link>
                .
              </p>
            )}
            <div className="ct-wizard-nav">
              <button type="button" className="btn" onClick={() => setStep(4)}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await persistOnboarding(
                    { offer_notes: onb.offer_notes, technographics_signals: onb.technographics_signals },
                    6
                  );
                  setStep(6);
                }}
                disabled={saving}
              >Next — launch</button>
            </div>
          </div>
        )}

        {step === 6 && strategy && (
          <div>
            <div className="ct-card">
              <h2>6 — Launch: campaign + lists to Clay (you push to sequencers)</h2>
              <p className="ct-wizard-help" style={{ marginTop: 6 }}>
                Select lane and offer, optionally generate 15+ ideas, then use Sales Nav URLs and
                Outscraper. Outscraper can hit your table webhook. You route to SmartLead / HeyReach
                from Clay, not this app.
              </p>
              <div className="ct-field">
                <label>Working campaign name *</label>
                <input
                  className="ct-input"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>
              <div className="ct-grid2">
                <div className="ct-field">
                  <label>ICP lane *</label>
                  <select className="ct-select" value={laneId} onChange={(e) => { setLaneId(e.target.value); setIdeaId(""); }}>
                    <option value="">Select…</option>
                    {lanes.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="ct-field">
                  <label>Offer *</label>
                  <select className="ct-select" value={offerId} onChange={(e) => setOfferId(e.target.value)}>
                    <option value="">Select…</option>
                    {offers.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {laneId && (
                <div className="ct-field">
                  <button type="button" className="btn" onClick={generateIdeas}>
                    Generate 15+ campaign ideas (Claude) for this lane
                  </button>
                </div>
              )}
              {laneId && ideas.length > 0 && (
                <div className="ct-field">
                  <label>Attach an idea (optional)</label>
                  <select className="ct-select" value={ideaId} onChange={(e) => setIdeaId(e.target.value)}>
                    <option value="">—</option>
                    {ideas.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="ct-card" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14 }}>List pipeline</h3>
              <ListPipelinePanel
                className="list-pipeline-embedded"
                variant="embedded"
                outscraperContext={ctx}
              />
            </div>
            <div className="ct-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setStep(5)}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={spawn}
                disabled={saving || !laneId || !offerId || !campaignName.trim()}
              >
                {saving ? "Creating…" : "Create campaign brief (Module 1) →"}
              </button>
            </div>
          </div>
        )}

        {clientId && step > 1 && !strategy && (
          <p className="ct-alert ct-alert-warn" style={{ marginTop: 12 }}>Preparing strategy…</p>
        )}
      </div>
    </div>
  );
}
