"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { SetupNav } from "@/components/campaign-tester/SetupNav";
import { TESTS } from "@/lib/campaign-tester/knowledge-base";
import {
  approvedOffers,
  moduleLocked,
  type BriefRecord,
} from "@/lib/campaign-tester/brief-types";

interface LiveCampaign {
  id: string;
  name: string;
  status: string | null;
  source_platform: string | null;
  send_volume: number | null;
  open_rate: number | null;
  reply_rate: number | null;
  positive_reply_count: number | null;
  meetings_booked: number | null;
  meetings_per_500: number | null;
  bounce_rate: number | null;
  campaign_start_date: string | null;
}

interface TestRun {
  id: string;
  test_number: number;
  variable_tested: string;
  variant_chosen: string;
  target_metric: string | null;
  generated_output: Record<string, unknown> | null;
  campaign_id: string | null;
  started_at: string;
}

export default function BriefOverviewPage() {
  const params = useParams<{ briefId: string }>();
  const briefId = params.briefId;

  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [briefRes, liveRes] = await Promise.all([
        fetch(`/api/campaign-tester/briefs/${briefId}`),
        fetch(`/api/campaign-tester/briefs/${briefId}/live-campaigns`),
      ]);
      const briefData = await briefRes.json();
      const liveData = await liveRes.json();
      setBrief(briefData.brief as BriefRecord);
      setRuns((briefData.test_runs ?? []) as TestRun[]);
      setLiveCampaigns((liveData.campaigns ?? []) as LiveCampaign[]);
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    if (briefId) void reload();
  }, [briefId, reload]);

  async function linkCampaign(run: TestRun, campaignId: string) {
    await fetch(`/api/campaign-tester/briefs/${briefId}/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        test_number: run.test_number,
        variant_chosen: run.variant_chosen,
        target_metric: run.target_metric,
        generated_output: run.generated_output,
        campaign_id: campaignId || null,
      }),
    });
    reload();
  }

  async function markStatus(status: "complete" | "abandoned" | "in_progress") {
    await fetch(`/api/campaign-tester/briefs/${briefId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  const liveById = useMemo(
    () => new Map(liveCampaigns.map((c) => [c.id, c])),
    [liveCampaigns],
  );

  // Evaluate the Test 1 hard gate. If the Test 1 run is linked to a live
  // campaign whose open rate is <30% or bounce rate >1.5%, Test 2+ are
  // hard-blocked and we surface a diagnostic banner.
  const test1Gate = useMemo(() => {
    const t1 = runs.find((r) => r.test_number === 1);
    if (!t1 || !t1.campaign_id) return { blocked: false, reason: null as string | null };
    const c = liveById.get(t1.campaign_id);
    if (!c) return { blocked: false, reason: null };
    const open = normalizeRate(c.open_rate);
    const bounce = normalizeRate(c.bounce_rate);
    if (open != null && open < 0.3) {
      return {
        blocked: true,
        reason: `Linked campaign open rate is ${(open * 100).toFixed(1)}% (<30%). Fix deliverability before Test 2.`,
      };
    }
    if (bounce != null && bounce > 0.015) {
      return {
        blocked: true,
        reason: `Linked campaign bounce rate is ${(bounce * 100).toFixed(2)}% (>1.5%). Fix list hygiene before Test 2.`,
      };
    }
    return { blocked: false, reason: null };
  }, [runs, liveById]);

  if (loading && !brief) {
    return (
      <div className="app-layout">
        <AppSidebar active="tester" />
        <div className="ct-shell">
          <div className="ct-header">
            <div className="skeleton" style={{ width: "40%", height: 20 }} />
          </div>
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
              <Link href="/campaign-tester">← Back to Campaign Tester</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const runByTest = new Map(runs.map((r) => [r.test_number, r]));
  const setupLocked = moduleLocked(brief.progress, "module_5_tests");
  const approved = approvedOffers(brief.offer_pool);

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> /{" "}
          {brief.clients?.name ? `${brief.clients.name} / ` : ""}
          {brief.name}
        </div>

        <div
          className="ct-header"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h1>{brief.name}</h1>
            <div className="ct-sub">
              {brief.clients?.name ? (
                <>
                  <strong style={{ color: "var(--text-primary)" }}>
                    {brief.clients.name}
                  </strong>{" "}
                  ·{" "}
                </>
              ) : null}
              {[
                brief.target_industry,
                brief.icp_job_title,
                brief.icp_company_size,
                brief.icp_geography,
              ]
                .filter(Boolean)
                .join(" · ") || "No ICP set"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn" href={`/campaign-tester/${brief.id}/diagnostic`}>
              Diagnostic
            </Link>
            {brief.status !== "complete" && (
              <button className="btn" onClick={() => markStatus("complete")}>
                Mark complete
              </button>
            )}
            {brief.status !== "abandoned" && (
              <button className="btn" onClick={() => markStatus("abandoned")}>
                Abandon
              </button>
            )}
          </div>
        </div>

        <SetupNav
          briefId={briefId}
          progress={brief.progress}
          current="module_5_tests"
        />

        {setupLocked && (
          <div className="ct-alert ct-alert-info">
            Finish the setup wizard (Modules 1-4) before running tests. Click through the module
            cards above to complete the brief, infrastructure, ICP, and offers.
          </div>
        )}

        {test1Gate.blocked && (
          <div className="ct-alert ct-alert-block">
            <strong>Test 1 gate tripped.</strong> {test1Gate.reason} Open the diagnostic pane for the
            recommended fix path.
          </div>
        )}

        {brief.offer_description && (
          <div className="ct-card">
            <h2>Offer hint</h2>
            <div style={{ color: "var(--text-secondary)" }}>{brief.offer_description}</div>
          </div>
        )}

        {approved.length > 0 && (
          <div className="ct-card">
            <h2>Approved offers (Test 2 variants)</h2>
            <div className="ct-card-sub">
              {approved.length} approved from Module 4 — Test 2 will A/B these head-to-head.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 8,
              }}
            >
              {approved.map((o) => (
                <div
                  key={o.id}
                  style={{
                    padding: 10,
                    background: "var(--accent-light)",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--accent)" }}>#{o.rank}</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{o.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {o.one_liner}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <Link
                className="btn"
                href={`/campaign-tester/${briefId}/setup/offers`}
                style={{ fontSize: 11 }}
              >
                Edit offers in Module 4
              </Link>
            </div>
          </div>
        )}

        <div className="ct-card">
          <h2>6-test wizard</h2>
          <div className="ct-card-sub">
            Run the 6 tests in order. Each completed test locks in a winner that later tests honor.
            Link a live SmartLead / HeyReach campaign to feed performance back from the nightly
            sync.
          </div>

          {TESTS.map((t) => {
            const run = runByTest.get(t.number);
            const linkedCampaign = run?.campaign_id ? liveById.get(run.campaign_id) : null;
            const setupIncomplete = setupLocked;
            const t1BlocksThis = t.number >= 2 && test1Gate.blocked;
            const testLocked = setupIncomplete || t1BlocksThis;

            return (
              <div
                key={t.number}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  opacity: testLocked && !run ? 0.65 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      Test {t.number} — {t.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Variable: {t.variableTested} · Success metric: {t.successMetric}
                    </div>
                    {run && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          marginTop: 4,
                        }}
                      >
                        Winner: <strong>{run.variant_chosen}</strong>
                      </div>
                    )}
                    {t.number === 2 && approved.length > 0 && !run && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--accent)",
                          marginTop: 4,
                        }}
                      >
                        Using {approved.length} approved offers from Module 4.
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span
                      className={`ct-chip ${
                        run
                          ? "ct-chip-pass"
                          : testLocked
                            ? "ct-chip-warn"
                            : "ct-chip-todo"
                      }`}
                    >
                      {run
                        ? "done"
                        : testLocked
                          ? t1BlocksThis
                            ? "blocked"
                            : "locked"
                          : "todo"}
                    </span>
                    {testLocked && !run ? (
                      <button
                        className="btn"
                        disabled
                        title={
                          t1BlocksThis
                            ? "Test 1 gate failed — fix deliverability first"
                            : "Complete the setup wizard first"
                        }
                      >
                        Locked
                      </button>
                    ) : (
                      <Link
                        className="btn"
                        href={`/campaign-tester/${brief.id}/test/${t.number}`}
                      >
                        {run ? "Review" : "Start"}
                      </Link>
                    )}
                  </div>
                </div>

                {run && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Linked live campaign:
                      </span>
                      <select
                        className="ct-select"
                        value={run.campaign_id ?? ""}
                        onChange={(e) => linkCampaign(run, e.target.value)}
                        style={{ maxWidth: 340 }}
                      >
                        <option value="">— not linked —</option>
                        {liveCampaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.source_platform ? ` · ${c.source_platform}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {linkedCampaign && (
                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gridTemplateColumns: "repeat(5, 1fr)",
                          gap: 8,
                        }}
                      >
                        <Stat label="Sent" value={fmtInt(linkedCampaign.send_volume)} />
                        <Stat label="Open %" value={fmtPct(linkedCampaign.open_rate)} />
                        <Stat label="Reply %" value={fmtPct(linkedCampaign.reply_rate)} />
                        <Stat
                          label="Bounce %"
                          value={fmtPct(linkedCampaign.bounce_rate)}
                        />
                        <Stat
                          label="Meetings / 500"
                          value={fmtDecimal(linkedCampaign.meetings_per_500, 2)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const pct = normalizeRate(n)!;
  return `${(pct * 100).toFixed(1)}%`;
}
function fmtDecimal(n: number | null | undefined, digits: number): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}

/**
 * SmartLead stats ship as percentages (45 = 45%); our classifier stores
 * fractions (0.45). Heuristic: values <= 1 treated as fraction, > 1 as percent.
 */
function normalizeRate(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (!isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
