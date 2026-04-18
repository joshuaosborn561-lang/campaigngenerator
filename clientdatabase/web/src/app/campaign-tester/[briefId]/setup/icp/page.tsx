"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { SetupNav } from "@/components/campaign-tester/SetupNav";
import { ChipInput } from "@/components/campaign-tester/ChipInput";
import { SIGNALS, getSignal } from "@/lib/campaign-tester/signals";
import { getVariant } from "@/lib/campaign-tester/knowledge-base";
import type {
  ApolloFilters,
  BriefRecord,
  IcpDefinitionAxis,
  IcpRefinement,
  TargetingRole,
} from "@/lib/campaign-tester/brief-types";

type Step = 1 | 2 | 3;

export default function IcpModulePage() {
  const { briefId } = useParams<{ briefId: string }>();
  const router = useRouter();

  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [icp, setIcp] = useState<IcpRefinement>({});
  const [signals, setSignals] = useState<string[]>([]);
  const [apollo, setApollo] = useState<ApolloFilters>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load brief");
      const b = data.brief as BriefRecord;
      setBrief(b);
      setIcp({
        targeting_role: b.icp_refinement?.targeting_role ?? null,
        icp_definition_by: b.icp_refinement?.icp_definition_by ?? [],
        bad_fit_profile: b.icp_refinement?.bad_fit_profile ?? null,
        min_company_size: b.icp_refinement?.min_company_size ?? null,
        primary_titles:
          b.icp_refinement?.primary_titles ??
          (b.icp_job_title
            ? String(b.icp_job_title)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : []),
        secondary_titles: b.icp_refinement?.secondary_titles ?? [],
        exclusions: b.icp_refinement?.exclusions ?? [],
      });
      setSignals(b.signals_selected ?? []);
      setApollo(b.apollo_filters ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load brief");
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    if (briefId) void reload();
  }, [briefId, reload]);

  function patchIcp<K extends keyof IcpRefinement>(k: K, v: IcpRefinement[K]) {
    setIcp((prev) => ({ ...prev, [k]: v }));
  }

  async function saveDraft() {
    if (!brief) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          icp_refinement: icp,
          signals_selected: signals,
          apollo_filters: apollo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setBrief(data.brief as BriefRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function generateApolloFilters() {
    if (!brief) return;
    setError(null);
    setGenerating(true);
    try {
      // Save refinement + signals first so the server sees the freshest input.
      const s = await fetch(`/api/campaign-tester/briefs/${briefId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          icp_refinement: icp,
          signals_selected: signals,
        }),
      });
      if (!s.ok) {
        const data = await s.json();
        throw new Error(data.error ?? "Failed to save refinement before generation");
      }

      const res = await fetch(
        `/api/campaign-tester/briefs/${briefId}/apollo-filters`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Filter generation failed");
      setApollo(data.apollo_filters as ApolloFilters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function finishModule() {
    if (!brief) return;
    if (!icp.primary_titles?.length) {
      setError("Step 1: add at least one primary title before finishing Module 3.");
      setStep(1);
      return;
    }
    if (!apollo.job_titles?.length) {
      setError("Step 3: generate the Apollo filter block before finishing Module 3.");
      setStep(3);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveDraft();
      const p = await fetch(`/api/campaign-tester/briefs/${briefId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "module_3_icp", complete: true }),
      });
      const pdata = await p.json();
      if (!p.ok) throw new Error(pdata.error ?? "Failed to mark module complete");
      router.push(`/campaign-tester/${briefId}/setup/offers`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !brief) {
    return (
      <div className="app-layout">
        <AppSidebar active="tester" />
        <div className="ct-shell">
          <div className="skeleton" style={{ width: "40%", height: 20 }} />
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="app-layout">
        <AppSidebar active="tester" />
        <div className="ct-shell">
          <div className="ct-header">
            <h1>Brief not found</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> /{" "}
          <Link href={`/campaign-tester/${briefId}`}>{brief.name}</Link> / Module 3
        </div>
        <div className="ct-header">
          <h1>Module 3 · ICP & list building</h1>
          <div className="ct-sub">
            Tighten the ICP, pick the buying signals you can source, and generate the exact Apollo /
            AI-Ark filter block.
          </div>
        </div>

        <SetupNav briefId={briefId} progress={brief.progress} current="module_3_icp" />

        <StepTabs step={step} onChange={setStep} />

        {step === 1 && (
          <IcpRefinementStep icp={icp} patch={patchIcp} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <SignalSelectionStep
            signals={signals}
            setSignals={setSignals}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <ApolloFiltersStep
            filters={apollo}
            signalsSelected={signals}
            generating={generating}
            onGenerate={generateApolloFilters}
            onBack={() => setStep(2)}
          />
        )}

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        <div className="ct-actions">
          <Link className="btn" href={`/campaign-tester/${briefId}/setup/infrastructure`}>
            ← Back to Module 2
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={saveDraft} disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              className="btn btn-primary"
              onClick={finishModule}
              disabled={saving || !apollo.job_titles?.length}
              title={apollo.job_titles?.length ? "" : "Generate Apollo filters first"}
            >
              Save & unlock Module 4 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Step switcher ----

function StepTabs({ step, onChange }: { step: Step; onChange: (s: Step) => void }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "ICP refinement" },
    { n: 2, label: "Signal selection" },
    { n: 3, label: "Apollo filters" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {steps.map((s) => (
        <button
          key={s.n}
          className="btn"
          onClick={() => onChange(s.n)}
          style={{
            flex: 1,
            textAlign: "left",
            borderColor: step === s.n ? "var(--accent)" : "var(--border)",
            background: step === s.n ? "var(--accent-light)" : "var(--bg-tertiary)",
            color: step === s.n ? "var(--accent)" : "var(--text-secondary)",
            padding: "10px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Step {s.n}
          </div>
          <div style={{ fontWeight: 600 }}>{s.label}</div>
        </button>
      ))}
    </div>
  );
}

// ---- Step 1 body ----

function IcpRefinementStep({
  icp,
  patch,
  onNext,
}: {
  icp: IcpRefinement;
  patch: <K extends keyof IcpRefinement>(k: K, v: IcpRefinement[K]) => void;
  onNext: () => void;
}) {
  const axes: { id: IcpDefinitionAxis; label: string }[] = [
    { id: "what_they_do", label: "What they do" },
    { id: "tools", label: "Tools they use" },
    { id: "signals", label: "Signals they're showing" },
  ];
  const selectedAxes = icp.icp_definition_by ?? [];

  return (
    <div className="ct-card">
      <h2>Step 1 — ICP refinement</h2>
      <div className="ct-card-sub">Sharpen the targeting before touching filters or copy.</div>

      <div className="ct-field">
        <label>Are you targeting the buyer or the user?</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["buyer", "user"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className="btn"
              onClick={() => patch("targeting_role", r as TargetingRole)}
              style={{
                flex: 1,
                borderColor:
                  icp.targeting_role === r ? "var(--accent)" : "var(--border)",
                background:
                  icp.targeting_role === r ? "var(--accent-light)" : "var(--bg-tertiary)",
                color:
                  icp.targeting_role === r ? "var(--accent)" : "var(--text-secondary)",
                textTransform: "capitalize",
              }}
            >
              {r === "buyer" ? "Buyer — CEO / Founder" : "User — VP / Director / Manager"}
            </button>
          ))}
        </div>
      </div>

      <div className="ct-field">
        <label>How is your ICP defined?</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {axes.map((a) => {
            const active = selectedAxes.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                className="btn"
                onClick={() =>
                  patch(
                    "icp_definition_by",
                    active
                      ? selectedAxes.filter((x) => x !== a.id)
                      : [...selectedAxes, a.id],
                  )
                }
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: active ? "var(--accent-light)" : "var(--bg-tertiary)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ct-grid2">
        <div className="ct-field">
          <label>What does a bad-fit prospect look like?</label>
          <textarea
            className="ct-textarea"
            value={icp.bad_fit_profile ?? ""}
            onChange={(e) => patch("bad_fit_profile", e.target.value)}
            placeholder="B2C, <10 employees, agencies…"
          />
        </div>
        <div className="ct-field">
          <label>Minimum company size (employees)</label>
          <input
            className="ct-input"
            type="number"
            value={icp.min_company_size ?? ""}
            onChange={(e) =>
              patch(
                "min_company_size",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </div>
        <div className="ct-field">
          <label>Primary titles (ranked 1–3)</label>
          <ChipInput
            value={icp.primary_titles ?? []}
            onChange={(v) => patch("primary_titles", v)}
          />
        </div>
        <div className="ct-field">
          <label>Secondary titles</label>
          <ChipInput
            value={icp.secondary_titles ?? []}
            onChange={(v) => patch("secondary_titles", v)}
          />
        </div>
        <div className="ct-field" style={{ gridColumn: "1 / -1" }}>
          <label>Exclusion criteria</label>
          <ChipInput
            value={icp.exclusions ?? []}
            onChange={(v) => patch("exclusions", v)}
            placeholder="B2C, agencies, <10 employees…"
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn btn-primary" onClick={onNext}>
          Next — signals →
        </button>
      </div>
    </div>
  );
}

// ---- Step 2 body ----

function SignalSelectionStep({
  signals,
  setSignals,
  onBack,
  onNext,
}: {
  signals: string[];
  setSignals: (v: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function toggle(id: string) {
    setSignals(signals.includes(id) ? signals.filter((x) => x !== id) : [...signals, id]);
  }
  return (
    <div className="ct-card">
      <h2>Step 2 — Signal selection</h2>
      <div className="ct-card-sub">
        Each signal maps to a play in Test 4. Only select signals you can actually source.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {SIGNALS.map((s) => {
          const active = signals.includes(s.id);
          const play = getVariant(4, s.pairsWithPlayId);
          return (
            <label
              key={s.id}
              className="ct-check"
              style={{
                alignItems: "flex-start",
                padding: "10px 12px",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent-light)" : "var(--bg-tertiary)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(s.id)}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.description}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Pairs best with{" "}
                  <span style={{ color: "var(--accent)" }}>{play?.label ?? s.pairsWithPlayId}</span>{" "}
                  in Test 4 · Source: {s.dataSource}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Next — generate filters →
        </button>
      </div>
    </div>
  );
}

// ---- Step 3 body ----

function ApolloFiltersStep({
  filters,
  signalsSelected,
  generating,
  onGenerate,
  onBack,
}: {
  filters: ApolloFilters;
  signalsSelected: string[];
  generating: boolean;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const hasFilters = Boolean(
    filters.job_titles?.length ||
      filters.industries?.length ||
      filters.keywords?.length,
  );

  // Keywords drive the real targeting. Display order reflects that: keywords
  // first, then the rest of the fields. Industries is intentionally last
  // because Apollo's industry taxonomy is too coarse to target sharply.
  const rows: [string, string[] | string | undefined][] = [
    ["KEYWORDS (industry-specific)", filters.keywords],
    ["JOB TITLES", filters.job_titles],
    ["EMPLOYEE COUNT", filters.employee_count],
    ["GEOGRAPHY", filters.geography],
    ["EXCLUDE", filters.exclude],
    ["SIGNALS TO LAYER", filters.signals_to_layer],
    ["INDUSTRIES (optional, imprecise)", filters.industries],
  ];
  const visible = rows.filter(([, v]) => v && (Array.isArray(v) ? v.length : !!v));

  return (
    <div className="ct-card">
      <h2>Step 3 — Apollo / AI-Ark filter spec</h2>
      <div className="ct-card-sub">
        Claude grounds this strictly in your brief + refined ICP + selected signals. Targeting is
        driven by <strong style={{ color: "var(--accent)" }}>industry-specific keywords</strong> —
        terminology only people inside this industry use. Apollo&apos;s industry taxonomy is
        deliberately de-emphasized.
      </div>
      <div style={{ marginBottom: 10 }}>
        <button
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? "Generating…" : hasFilters ? "Regenerate" : "Generate filters"}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="ct-pre" style={{ color: "var(--text-muted)" }}>
          {"// Click Generate to produce the Apollo filter block."}
        </div>
      ) : (
        <pre className="ct-pre">
          {visible
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join("\n")}
        </pre>
      )}

      {filters.keywords && filters.keywords.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent-light)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          <strong style={{ color: "var(--accent)" }}>Paste into Apollo:</strong> copy the{" "}
          <span style={{ color: "var(--text-primary)" }}>KEYWORDS</span> block into Apollo&apos;s
          Company or Contact keyword filter — it searches job titles, company descriptions, and
          tech stack simultaneously. That is the sharpest lever Apollo has.
        </div>
      )}

      {filters.tam_estimate && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-tertiary)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--text-muted)",
              marginRight: 8,
            }}
          >
            TAM estimate
          </span>
          <span style={{ color: "var(--text-primary)" }}>{filters.tam_estimate}</span>
        </div>
      )}

      {filters.sourcing_instructions &&
        Object.keys(filters.sourcing_instructions).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Sourcing instructions per signal
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {Object.entries(filters.sourcing_instructions).map(([id, instr]) => {
                const sig = getSignal(id);
                const name = sig?.label ?? id;
                return (
                  <div
                    key={id}
                    style={{
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-tertiary)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--accent)",
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                      }}
                    >
                      {name}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "var(--text-secondary)",
                        fontSize: 12,
                      }}
                    >
                      {instr}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {signalsSelected.length === 0 && (
        <div className="ct-alert ct-alert-info" style={{ marginTop: 12 }}>
          No signals selected — Claude will default to a cold-database sourcing note.
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
