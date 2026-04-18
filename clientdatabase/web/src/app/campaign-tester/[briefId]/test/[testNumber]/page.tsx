"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import {
  INFRASTRUCTURE_CHECKLIST,
  TESTS,
  getTest,
  type TestDefinition,
  type TestVariant,
} from "@/lib/campaign-tester/knowledge-base";
import { approvedOffers, type Offer } from "@/lib/campaign-tester/brief-types";

interface Brief {
  id: string;
  name: string;
  infrastructure_status: Record<string, boolean> | null;
  available_plays: string[] | null;
  offer_pool: Offer[] | null;
  clients?: { name: string } | null;
}

interface TestRun {
  id: string;
  test_number: number;
  variant_chosen: string;
  target_metric: string | null;
  generated_output: Record<string, unknown> | null;
  campaign_id: string | null;
}

interface BenchmarkSummary {
  exact_count: number;
  partial_count: number;
  baseline_count: number;
  avg_positive_reply_rate: number | null;
  avg_meetings_per_500: number | null;
  best_meetings_per_500: number | null;
}

export default function TestWizardPage() {
  const params = useParams<{ briefId: string; testNumber: string }>();
  const router = useRouter();
  const briefId = params.briefId;
  const testNumber = Number(params.testNumber);
  const test = getTest(testNumber);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [priorRun, setPriorRun] = useState<TestRun | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [variantId, setVariantId] = useState<string>("");
  const [subVariants, setSubVariants] = useState<Record<string, string>>({});
  const [infraState, setInfraState] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [briefRes, benchRes] = await Promise.all([
        fetch(`/api/campaign-tester/briefs/${briefId}`),
        fetch(`/api/campaign-tester/briefs/${briefId}/benchmarks`),
      ]);
      const briefData = await briefRes.json();
      const benchData = await benchRes.json();
      setBrief(briefData.brief);

      const existing = (briefData.test_runs as TestRun[] | undefined)?.find(
        (r) => r.test_number === testNumber
      );
      setPriorRun(existing ?? null);
      if (existing) {
        setVariantId(existing.variant_chosen);
        setGenerated(existing.generated_output);
      }

      // Hydrate Test 1 state from the brief.
      if (testNumber === 1) {
        setInfraState(briefData.brief?.infrastructure_status ?? {});
      }

      setBenchmarks(benchData?.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [briefId, testNumber]);

  useEffect(() => {
    if (briefId) load();
  }, [briefId, load]);

  // -------------------------------------------------------------
  // Test 1 — infrastructure checklist (pass/fail)
  // -------------------------------------------------------------

  async function saveInfrastructure(result: "passed" | "failed") {
    setSaving(true);
    setError(null);
    try {
      // Persist checklist state on the brief.
      await fetch(`/api/campaign-tester/briefs/${briefId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infrastructure_status: infraState }),
      });

      // Record a test_run for Test 1.
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_number: 1,
          variant_chosen: result,
          target_metric: "open_rate > 40% AND bounce_rate < 1.5%",
          generated_output: { checklist: infraState },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        router.push(`/campaign-tester/${briefId}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------
  // Tests 2-6 — variant pick + Claude generation
  // -------------------------------------------------------------

  async function generate() {
    if (!test) return;
    setError(null);

    const payload: Record<string, unknown> = {
      test_number: testNumber,
      variant_id: variantId,
      sub_variants: Object.keys(subVariants).length > 0 ? subVariants : undefined,
    };

    // Tests 3 and 5 have only sub-variables, no main variant. Pick a synthetic
    // variant_id so the API sees something non-empty.
    if (!variantId && Object.keys(subVariants).length > 0) {
      payload.variant_id = "composite";
    }

    setGenerating(true);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
      } else {
        setGenerated(data.generated);
      }
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveRun() {
    if (!test) return;
    setSaving(true);
    setError(null);
    try {
      // variant_chosen: main variant if present, otherwise a concatenation of
      // sub-variant picks (for Tests 3 and 5).
      let chosen = variantId;
      if (!chosen && Object.keys(subVariants).length > 0) {
        chosen = Object.entries(subVariants)
          .map(([k, v]) => `${k}=${v}`)
          .join(";");
      }
      if (!chosen) {
        setError("Pick a variant first.");
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/campaign-tester/briefs/${briefId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_number: testNumber,
          variant_chosen: chosen,
          target_metric: test.successMetric,
          generated_output: generated,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        router.push(`/campaign-tester/${briefId}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!test) {
    return (
      <div className="app-layout">
        <AppSidebar active="tester" />
        <div className="ct-shell">
          <div className="ct-header">
            <h1>Unknown test</h1>
            <div className="ct-sub">
              <Link href={`/campaign-tester/${briefId}`}>← Back to brief</Link>
            </div>
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
          <Link href="/campaign-tester">Campaign Tester</Link>{" "}
          /{" "}
          <Link href={`/campaign-tester/${briefId}`}>
            {brief?.name ?? "Brief"}
          </Link>{" "}
          / Test {test.number}
        </div>

        <div className="ct-header">
          <h1>
            Test {test.number}: {test.name}
          </h1>
          <div className="ct-sub">{test.summary}</div>
        </div>

        <div className="ct-card">
          <h2>Why this test</h2>
          <div style={{ color: "var(--text-secondary)", marginBottom: 10 }}>
            {test.explanation}
          </div>
          <div className="ct-chip">Success metric: {test.successMetric}</div>
          {priorRun && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
              Existing winner on this test: <strong>{priorRun.variant_chosen}</strong>. Saving
              again will overwrite.
            </div>
          )}
        </div>

        {benchmarks && (testNumber >= 2) && (
          <div className="ct-card">
            <h2>Historical benchmark</h2>
            <div className="ct-card-sub">
              Performance of past campaigns matching this brief&apos;s ICP axes.
            </div>
            <div className="ct-metric-grid">
              <Metric
                label="Past campaigns (exact)"
                value={String(benchmarks.exact_count)}
              />
              <Metric
                label="Avg positive reply"
                value={fmtPct(benchmarks.avg_positive_reply_rate)}
              />
              <Metric
                label="Avg meetings / 500"
                value={fmtDecimal(benchmarks.avg_meetings_per_500, 2)}
              />
              <Metric
                label="Best meetings / 500"
                value={fmtDecimal(benchmarks.best_meetings_per_500, 2)}
              />
            </div>
          </div>
        )}

        {/* Body branches by test type */}
        {testNumber === 1 ? (
          <Test1Body
            state={infraState}
            onToggle={(id) =>
              setInfraState((prev) => ({ ...prev, [id]: !prev[id] }))
            }
          />
        ) : (
          <TestCopyBody
            test={test}
            briefId={briefId}
            availablePlays={brief?.available_plays ?? null}
            offerPool={brief?.offer_pool ?? null}
            variantId={variantId}
            setVariantId={setVariantId}
            subVariants={subVariants}
            setSubVariants={setSubVariants}
            generated={generated}
            generating={generating}
            onGenerate={generate}
          />
        )}

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        <div className="ct-actions">
          <Link className="btn" href={`/campaign-tester/${briefId}`}>← Back</Link>
          {testNumber === 1 ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => saveInfrastructure("failed")} disabled={saving || loading}>
                Save as failed
              </button>
              <button className="btn btn-primary" onClick={() => saveInfrastructure("passed")} disabled={saving || loading}>
                {saving ? "Saving..." : "Mark passed"}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={saveRun}
              disabled={saving || loading || (!variantId && Object.keys(subVariants).length === 0)}
            >
              {saving ? "Saving..." : "Save as winner"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Test 1 body — checklist
// -------------------------------------------------------------

function Test1Body({
  state,
  onToggle,
}: {
  state: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const byCategory = useMemo(() => {
    const buckets: Record<string, typeof INFRASTRUCTURE_CHECKLIST> = {
      deliverability: [],
      list_hygiene: [],
      volume: [],
    };
    for (const item of INFRASTRUCTURE_CHECKLIST) {
      buckets[item.category].push(item);
    }
    return buckets;
  }, []);

  const totalChecked = Object.values(state).filter(Boolean).length;

  return (
    <div className="ct-card">
      <h2>Infrastructure checklist</h2>
      <div className="ct-card-sub">
        {totalChecked}/{INFRASTRUCTURE_CHECKLIST.length} checked. You must be
        green on all of these before testing copy — otherwise you&apos;re measuring
        your DNS, not your message.
      </div>

      {(["deliverability", "list_hygiene", "volume"] as const).map((cat) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            {cat.replace("_", " ")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {byCategory[cat].map((item) => (
              <label key={item.id} className="ct-check">
                <input
                  type="checkbox"
                  checked={!!state[item.id]}
                  onChange={() => onToggle(item.id)}
                />
                <span className="ct-check-label">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------
// Tests 2-6 body — variant picker + Claude generation
// -------------------------------------------------------------

function TestCopyBody({
  test,
  briefId,
  availablePlays,
  offerPool,
  variantId,
  setVariantId,
  subVariants,
  setSubVariants,
  generated,
  generating,
  onGenerate,
}: {
  test: TestDefinition;
  briefId: string;
  availablePlays: string[] | null;
  offerPool: Offer[] | null;
  variantId: string;
  setVariantId: (v: string) => void;
  subVariants: Record<string, string>;
  setSubVariants: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  generated: Record<string, unknown> | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  // Test 2 — replace the fixed 5-variant list with the operator's approved
  // offers from Module 4, if any exist. Each approved offer becomes a variant
  // whose id is "custom:<offerId>" — the prompt builder on the server side
  // resolves that back to the full offer definition.
  const approvedForOffer =
    test.number === 2 ? approvedOffers(offerPool) : [];
  const usingCustomOffers = test.number === 2 && approvedForOffer.length > 0;

  const variantsToShow: TestVariant[] = usingCustomOffers
    ? approvedForOffer.map((o) => ({
        id: `custom:${o.id}`,
        label: `${o.name}`,
        description: o.one_liner,
        generationGuidance: o.cta
          ? `Keep the CTA aligned with: ${o.cta}`
          : undefined,
      }))
    : test.number === 4 && availablePlays && availablePlays.length > 0
      ? test.variants.filter(
          (v) => availablePlays.includes(v.id) || v.id === "generic_pain",
        )
      : test.variants;

  const hasMainVariants = variantsToShow.length > 0;
  const canGenerate =
    hasMainVariants ? !!variantId : Object.keys(subVariants).length > 0;

  return (
    <>
      {hasMainVariants && (
        <div className="ct-card">
          <h2>Pick the variant</h2>
          <div className="ct-card-sub">
            {usingCustomOffers ? (
              <>
                These are the offers you approved in{" "}
                <Link href={`/campaign-tester/${briefId}/setup/offers`}>
                  Module 4
                </Link>
                . Generate copy for each and let the winner carry into Test 3.
              </>
            ) : (
              <>Only the options in this grid are eligible — the knowledge base is the source of truth.</>
            )}
          </div>
          <div className="ct-variant-grid">
            {variantsToShow.map((v) => (
              <div
                key={v.id}
                className={`ct-variant${variantId === v.id ? " selected" : ""}`}
                onClick={() => setVariantId(v.id)}
              >
                <div className="ct-variant-label">{v.label}</div>
                <div className="ct-variant-desc">{v.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {test.subVariables?.map((sub) => (
        <div key={sub.id} className="ct-card">
          <h2>{sub.label}</h2>
          <div className="ct-variant-grid">
            {sub.options.map((opt) => (
              <div
                key={opt.id}
                className={`ct-variant${subVariants[sub.id] === opt.id ? " selected" : ""}`}
                onClick={() =>
                  setSubVariants((prev) => ({ ...prev, [sub.id]: opt.id }))
                }
              >
                <div className="ct-variant-label">{opt.label}</div>
                <div className="ct-variant-desc">{opt.description}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="ct-card">
        <h2>Generated copy</h2>
        <div className="ct-card-sub">
          Claude drafts copy using only the chosen variant(s), your brief, and
          any winning choices from prior tests. Regenerate until it reads right.
        </div>
        <div style={{ marginBottom: 10 }}>
          <button
            className="btn btn-primary"
            onClick={onGenerate}
            disabled={!canGenerate || generating}
          >
            {generating ? "Generating..." : generated ? "Regenerate" : "Generate"}
          </button>
        </div>
        {generated ? (
          <GeneratedOutput data={generated} />
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
            No output yet. Pick a variant and click Generate.
          </div>
        )}
      </div>
    </>
  );
}

function GeneratedOutput({ data }: { data: Record<string, unknown> }) {
  // Standard single-email shape: { subject, body_plain_text, variant_rationale }
  const subject = typeof data.subject === "string" ? data.subject : null;
  const body = typeof data.body_plain_text === "string" ? data.body_plain_text : null;
  const rationale = typeof data.variant_rationale === "string" ? data.variant_rationale : null;
  const sequence = Array.isArray(data.sequence) ? (data.sequence as any[]) : null;
  const segmentation = (data.segmentation_criteria ?? null) as Record<string, unknown> | null;

  return (
    <div>
      {segmentation && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Segmentation
          </div>
          <pre className="ct-pre">{JSON.stringify(segmentation, null, 2)}</pre>
        </div>
      )}
      {subject && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Subject
          </div>
          <div className="ct-pre">{subject}</div>
        </div>
      )}
      {body && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Body
          </div>
          <div className="ct-pre">{body}</div>
        </div>
      )}
      {sequence && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Sequence
          </div>
          {sequence.map((step, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                Step {step.step} · {step.channel} · +{step.delay_days}d · {step.angle}
              </div>
              {step.subject && <div className="ct-pre" style={{ marginBottom: 4 }}>{step.subject}</div>}
              <div className="ct-pre">{step.body_plain_text}</div>
            </div>
          ))}
        </div>
      )}
      {rationale && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>
          Why this matches the variant: {rationale}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Tiny helpers
// -------------------------------------------------------------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-metric">
      <div className="ct-metric-label">{label}</div>
      <div className="ct-metric-value">{value}</div>
    </div>
  );
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}
function fmtDecimal(n: number | null | undefined, digits: number): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}

// Suppress unused-var warning on TESTS if tree-shaking gets funny.
void TESTS;
