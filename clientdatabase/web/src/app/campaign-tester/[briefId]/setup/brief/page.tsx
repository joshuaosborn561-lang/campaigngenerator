"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { SetupNav } from "@/components/campaign-tester/SetupNav";
import { ChipInput } from "@/components/campaign-tester/ChipInput";
import type { BriefRecord, RiskTolerance } from "@/lib/campaign-tester/brief-types";

const COMPANY_SIZE_OPTIONS = ["", "1-10", "11-50", "51-200", "201-500", "500+"];

const RISK_OPTIONS: { value: Exclude<RiskTolerance, null>; label: string }[] = [
  { value: "pay_per_meeting", label: "Pay per meeting" },
  { value: "guarantee", label: "Results guarantee" },
  { value: "free_trial", label: "Free trial / pilot" },
  { value: "money_back", label: "Money-back" },
  { value: "none", label: "None" },
];

const ASSET_OPTIONS = [
  { id: "case_studies", label: "Case studies with named logos" },
  { id: "named_clients", label: "Named clients we can reference" },
  { id: "loom_capacity", label: "Capacity to record Looms" },
  { id: "competitor_data", label: "Competitor follower / brand data" },
  { id: "tech_stack_data", label: "Technographic data (BuiltWith etc.)" },
  { id: "hiring_signals", label: "Hiring signal access (lead database / LinkedIn)" },
  { id: "social_proof", label: "Social proof (numbers, testimonials)" },
  { id: "data_assets", label: "Pre-built lead lists / reports" },
  { id: "physical_gifts", label: "Budget for physical gifts (shock & awe)" },
];

function isComplete(b: BriefRecord): boolean {
  return Boolean(
    b.name &&
      b.what_they_do &&
      b.measurable_outcome &&
      b.target_industry &&
      b.icp_job_title &&
      b.core_pain,
  );
}

export default function BriefModulePage() {
  const { briefId } = useParams<{ briefId: string }>();
  const router = useRouter();

  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Titles ship as a string in the legacy column but we want to edit as chips.
  const [targetTitles, setTargetTitles] = useState<string[]>([]);
  const [targetGeography, setTargetGeography] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load brief");
      setBrief(data.brief as BriefRecord);
      setTargetTitles(
        data.brief.icp_job_title
          ? String(data.brief.icp_job_title)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
      );
      setTargetGeography(
        data.brief.icp_geography
          ? String(data.brief.icp_geography)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load brief");
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    if (briefId) void reload();
  }, [briefId, reload]);

  function update<K extends keyof BriefRecord>(k: K, v: BriefRecord[K]) {
    setBrief((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  function updateAsset(id: string, checked: boolean) {
    setBrief((prev) => {
      if (!prev) return prev;
      const next = { ...(prev.available_assets ?? {}), [id]: checked };
      return { ...prev, available_assets: next };
    });
  }

  async function save(markComplete: boolean) {
    if (!brief) return;
    if (markComplete && !isComplete(brief)) {
      setError("Fill required fields (marked *) before unlocking Module 2.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch = {
        name: brief.name,
        what_they_do: brief.what_they_do,
        measurable_outcome: brief.measurable_outcome,
        timeline_claim: brief.timeline_claim,
        named_results: brief.named_results,
        risk_tolerance: brief.risk_tolerance,
        core_pain: brief.core_pain,
        offer_description: brief.offer_description,
        target_industry: brief.target_industry,
        icp_job_title: targetTitles.join(", ") || null,
        icp_company_size: brief.icp_company_size,
        icp_geography: targetGeography.join(", ") || null,
        available_assets: brief.available_assets ?? {},
      };
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save brief");
      setBrief(data.brief as BriefRecord);

      if (markComplete) {
        const p = await fetch(`/api/campaign-tester/briefs/${briefId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module: "module_1_brief", complete: true }),
        });
        const pdata = await p.json();
        if (!p.ok) throw new Error(pdata.error ?? "Failed to mark module complete");
        router.push(`/campaign-tester/${briefId}/setup/infrastructure`);
      }
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
            <div className="ct-sub">
              <Link href="/campaign-tester">← Back</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const complete = isComplete(brief);

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> /{" "}
          <Link href={`/campaign-tester/${briefId}`}>{brief.name}</Link> / Module 1
        </div>
        <div className="ct-header">
          <h1>Module 1 · Campaign brief</h1>
          <div className="ct-sub">
            The source of truth for every downstream module. Be specific — every Claude call
            re-injects these fields as context.
          </div>
        </div>

        <SetupNav briefId={briefId} progress={brief.progress} current="module_1_brief" />

        <div className="ct-card">
          <h2>Basics</h2>
          <div className="ct-grid2">
            <div className="ct-field">
              <label>Campaign name *</label>
              <input
                className="ct-input"
                value={brief.name ?? ""}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="ct-field">
              <label>What they do (one sentence) *</label>
              <input
                className="ct-input"
                value={brief.what_they_do ?? ""}
                onChange={(e) => update("what_they_do", e.target.value)}
                placeholder="They build AI voice agents for home services."
              />
            </div>
            <div className="ct-field">
              <label>Measurable outcome *</label>
              <input
                className="ct-input"
                value={brief.measurable_outcome ?? ""}
                onChange={(e) => update("measurable_outcome", e.target.value)}
                placeholder="3x booked meetings per rep"
              />
            </div>
            <div className="ct-field">
              <label>Timeline claim</label>
              <input
                className="ct-input"
                value={brief.timeline_claim ?? ""}
                onChange={(e) => update("timeline_claim", e.target.value)}
                placeholder="in 90 days"
              />
            </div>
            <div className="ct-field" style={{ gridColumn: "1 / -1" }}>
              <label>Named clients / case study results</label>
              <textarea
                className="ct-textarea"
                rows={2}
                value={brief.named_results ?? ""}
                onChange={(e) => update("named_results", e.target.value)}
                placeholder="ServPro franchisees — 42 meetings in 60 days. Named logos only."
              />
            </div>
            <div className="ct-field">
              <label>Risk tolerance</label>
              <select
                className="ct-select"
                value={brief.risk_tolerance ?? ""}
                onChange={(e) =>
                  update(
                    "risk_tolerance",
                    (e.target.value || null) as RiskTolerance,
                  )
                }
              >
                <option value="">— not specified —</option>
                {RISK_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ct-field">
              <label>Offer description (operator hint)</label>
              <input
                className="ct-input"
                value={brief.offer_description ?? ""}
                onChange={(e) => update("offer_description", e.target.value)}
                placeholder="Free Loom audit of their outbound setup"
              />
            </div>
          </div>
        </div>

        <div className="ct-card">
          <h2>Targeting</h2>
          <div className="ct-grid2">
            <div className="ct-field">
              <label>Target industry / vertical *</label>
              <input
                className="ct-input"
                value={brief.target_industry ?? ""}
                onChange={(e) => update("target_industry", e.target.value)}
                placeholder="Home services, SaaS, staffing…"
              />
            </div>
            <div className="ct-field">
              <label>Target titles *</label>
              <ChipInput
                value={targetTitles}
                onChange={setTargetTitles}
                placeholder="Founder, VP Sales, …"
                ariaLabel="Target titles"
              />
            </div>
            <div className="ct-field">
              <label>Company size</label>
              <select
                className="ct-select"
                value={brief.icp_company_size ?? ""}
                onChange={(e) => update("icp_company_size", e.target.value || null)}
              >
                {COMPANY_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s || "Any"}
                  </option>
                ))}
              </select>
            </div>
            <div className="ct-field">
              <label>Geography</label>
              <ChipInput
                value={targetGeography}
                onChange={setTargetGeography}
                placeholder="US, Canada, UK, …"
                ariaLabel="Target geography"
              />
            </div>
            <div className="ct-field" style={{ gridColumn: "1 / -1" }}>
              <label>Core pain point they solve *</label>
              <textarea
                className="ct-textarea"
                rows={2}
                value={brief.core_pain ?? ""}
                onChange={(e) => update("core_pain", e.target.value)}
                placeholder="Missed after-hours calls → lost revenue"
              />
            </div>
          </div>
        </div>

        <div className="ct-card">
          <h2>Available assets</h2>
          <div className="ct-card-sub">
            Bounds which plays and offers are realistic. Checked items unlock corresponding plays in
            Test 4.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {ASSET_OPTIONS.map((a) => (
              <label key={a.id} className="ct-check">
                <input
                  type="checkbox"
                  checked={!!brief.available_assets?.[a.id]}
                  onChange={(e) => updateAsset(a.id, e.target.checked)}
                />
                <span className="ct-check-label">{a.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        <div className="ct-actions">
          <Link className="btn" href={`/campaign-tester/${briefId}`}>
            ← Back to brief
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => save(false)} disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => save(true)}
              disabled={saving || !complete}
              title={complete ? "" : "Fill required fields"}
            >
              {saving ? "Saving…" : "Save & unlock Module 2 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
