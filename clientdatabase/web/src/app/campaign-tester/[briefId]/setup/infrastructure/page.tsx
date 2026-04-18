"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { SetupNav } from "@/components/campaign-tester/SetupNav";
import {
  CHECKLIST_CATEGORIES,
  INFRA_CHECKLIST_V2,
  calcInfrastructure,
  checklistComplete,
} from "@/lib/campaign-tester/infra-calc";
import type { BriefRecord } from "@/lib/campaign-tester/brief-types";

export default function InfrastructureModulePage() {
  const { briefId } = useParams<{ briefId: string }>();
  const router = useRouter();

  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [monthly, setMonthly] = useState<number>(5000);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load brief");
      const b = data.brief as BriefRecord;
      setBrief(b);
      setMonthly(b.monthly_email_volume ?? 5000);
      setChecks(b.infrastructure_status ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load brief");
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    if (briefId) void reload();
  }, [briefId, reload]);

  const computed = useMemo(() => calcInfrastructure(monthly), [monthly]);
  const allChecked = checklistComplete(checks);

  async function save(markComplete: boolean) {
    if (!brief) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_email_volume: monthly,
          infra_calc: computed,
          infrastructure_status: checks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setBrief(data.brief as BriefRecord);

      if (markComplete) {
        if (!allChecked) {
          throw new Error("Complete every checklist item before unlocking Module 3.");
        }
        const p = await fetch(`/api/campaign-tester/briefs/${briefId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module: "module_2_infra", complete: true }),
        });
        const pdata = await p.json();
        if (!p.ok) throw new Error(pdata.error ?? "Failed to mark module complete");
        router.push(`/campaign-tester/${briefId}/setup/icp`);
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
          </div>
        </div>
      </div>
    );
  }

  const checklistByCat = Object.fromEntries(
    CHECKLIST_CATEGORIES.map((c) => [
      c.id,
      INFRA_CHECKLIST_V2.filter((i) => i.category === c.id),
    ]),
  );

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> /{" "}
          <Link href={`/campaign-tester/${briefId}`}>{brief.name}</Link> / Module 2
        </div>
        <div className="ct-header">
          <h1>Module 2 · Infrastructure</h1>
          <div className="ct-sub">
            Sizing math first. Checklist second. Module 3 stays locked until every box is green.
          </div>
        </div>

        <SetupNav briefId={briefId} progress={brief.progress} current="module_2_infra" />

        <div className="ct-card">
          <h2>Step 1 · Calculator</h2>
          <div className="ct-card-sub">
            22 working days · 25 sends / inbox / day · 4 inboxes / domain · 20% safety buffer.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px repeat(3, 1fr)",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div className="ct-field">
              <label>Emails / month</label>
              <input
                className="ct-input"
                type="number"
                min={0}
                step={500}
                value={monthly}
                onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <InfraStat label="Emails / day" value={computed.emails_per_day} hint="÷ 22 working days" />
            <InfraStat
              label="Inboxes needed"
              value={computed.inboxes_needed}
              hint="÷ 25 sends/inbox/day"
            />
            <InfraStat
              label="Domains needed"
              value={computed.domains_needed}
              hint="4/domain +20% buffer"
            />
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "var(--accent-light)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              color: "var(--text-primary)",
            }}
          >
            You need{" "}
            <strong style={{ color: "var(--accent)" }}>{computed.domains_needed} domains</strong>{" "}
            and{" "}
            <strong style={{ color: "var(--accent)" }}>{computed.inboxes_needed} inboxes</strong> to
            hit{" "}
            <strong style={{ color: "var(--accent)" }}>
              {monthly.toLocaleString()} emails/month
            </strong>
            .
          </div>
        </div>

        <div className="ct-card">
          <h2>Step 2 · Setup checklist</h2>
          <div className="ct-card-sub">
            {INFRA_CHECKLIST_V2.filter((i) => checks[i.id]).length}/{INFRA_CHECKLIST_V2.length} items
            complete. Module 3 unlocks when every box is ticked.
          </div>
          {CHECKLIST_CATEGORIES.map((cat) => (
            <div key={cat.id} style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                {cat.label}
              </div>
              <div>
                {checklistByCat[cat.id].map((item) => (
                  <label key={item.id} className="ct-check" style={{ marginBottom: 2 }}>
                    <input
                      type="checkbox"
                      checked={!!checks[item.id]}
                      onChange={(e) =>
                        setChecks((c) => ({ ...c, [item.id]: e.target.checked }))
                      }
                    />
                    <span className="ct-check-label">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        <div className="ct-actions">
          <Link className="btn" href={`/campaign-tester/${briefId}/setup/brief`}>
            ← Back
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => save(false)} disabled={saving}>
              {saving ? "Saving…" : "Save progress"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => save(true)}
              disabled={saving || !allChecked}
            >
              Save & unlock Module 3 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfraStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}
