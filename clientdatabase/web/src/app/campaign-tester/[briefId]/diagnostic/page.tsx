"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import {
  DIAGNOSTIC_RULES,
  TESTS,
} from "@/lib/campaign-tester/knowledge-base";

interface Brief {
  id: string;
  name: string;
  clients?: { name: string } | null;
}

interface TestRun {
  id: string;
  test_number: number;
  variant_chosen: string;
  campaign_id: string | null;
}

interface LiveCampaign {
  id: string;
  name: string;
  send_volume: number | null;
  open_rate: number | null;
  reply_rate: number | null;
  positive_reply_count: number | null;
  meetings_booked: number | null;
  meetings_per_500: number | null;
}

export default function DiagnosticPage() {
  const params = useParams<{ briefId: string }>();
  const briefId = params.briefId;

  const [brief, setBrief] = useState<Brief | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [briefRes, liveRes] = await Promise.all([
        fetch(`/api/campaign-tester/briefs/${briefId}`),
        fetch(`/api/campaign-tester/briefs/${briefId}/live-campaigns`),
      ]);
      const briefData = await briefRes.json();
      const liveData = await liveRes.json();
      setBrief(briefData.brief);
      setRuns(briefData.test_runs ?? []);
      setLiveCampaigns(liveData.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    if (briefId) load();
  }, [briefId, load]);

  const linkedPerTest = useMemo(() => {
    const liveById = new Map(liveCampaigns.map((c) => [c.id, c]));
    return runs
      .map((r) => ({ run: r, campaign: r.campaign_id ? liveById.get(r.campaign_id) ?? null : null }))
      .filter((x) => x.campaign);
  }, [runs, liveCampaigns]);

  // Aggregate metrics for the whole brief based on linked live campaigns.
  const aggregate = useMemo(() => {
    const rows = linkedPerTest.map((x) => x.campaign!);
    if (rows.length === 0) {
      return { open_rate: null, reply_rate: null, positive_reply_rate: null, meetings_booked: 0, emails_sent: 0 };
    }
    const totalSent = rows.reduce((a, r) => a + (r.send_volume ?? 0), 0);
    const totalPositive = rows.reduce((a, r) => a + (r.positive_reply_count ?? 0), 0);
    const totalMeetings = rows.reduce((a, r) => a + (r.meetings_booked ?? 0), 0);
    // Simple average for rates across linked campaigns (good enough for a
    // diagnostic at-a-glance — per-campaign rates are the more interesting cut).
    const openRates = rows.map((r) => r.open_rate).filter((v): v is number => v != null);
    const replyRates = rows.map((r) => r.reply_rate).filter((v): v is number => v != null);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    // Heuristic: SmartLead stores rates as percents (e.g. 45), not fractions.
    // Normalize to fractions for the diagnostic rules.
    const toFraction = (n: number | null) => (n == null ? null : n > 1 ? n / 100 : n);

    return {
      open_rate: toFraction(avg(openRates)),
      reply_rate: toFraction(avg(replyRates)),
      positive_reply_rate: totalSent > 0 ? totalPositive / totalSent : null,
      meetings_booked: totalMeetings,
      emails_sent: totalSent,
    };
  }, [linkedPerTest]);

  const triggeredRules = DIAGNOSTIC_RULES.filter((rule) => rule.symptomCheck(aggregate));

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> /{" "}
          <Link href={`/campaign-tester/${briefId}`}>
            {brief?.name ?? "Brief"}
          </Link>{" "}
          / Diagnostic
        </div>

        <div className="ct-header">
          <h1>Diagnostic</h1>
          <div className="ct-sub">
            Live symptoms from the campaigns you&apos;ve linked to this brief,
            with probable causes and next actions.
          </div>
        </div>

        {loading ? (
          <div className="ct-card">
            <div className="skeleton" style={{ width: "40%", marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "70%" }} />
          </div>
        ) : linkedPerTest.length === 0 ? (
          <div className="ct-card">
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-state-title">No live campaigns linked yet</div>
              <div>
                Go back to the brief and link a SmartLead or HeyReach campaign to
                a completed test. Performance syncs nightly.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="ct-card">
              <h2>Aggregate</h2>
              <div className="ct-card-sub">
                Pooled across {linkedPerTest.length} linked campaign{linkedPerTest.length === 1 ? "" : "s"}.
              </div>
              <div className="ct-metric-grid">
                <Metric label="Emails sent" value={fmtInt(aggregate.emails_sent)} />
                <Metric label="Open rate" value={fmtPct(aggregate.open_rate)} />
                <Metric label="Reply rate" value={fmtPct(aggregate.reply_rate)} />
                <Metric label="Positive reply rate" value={fmtPct(aggregate.positive_reply_rate)} />
                <Metric label="Meetings booked" value={fmtInt(aggregate.meetings_booked)} />
                <Metric
                  label="Emails per booking"
                  value={
                    aggregate.meetings_booked > 0
                      ? Math.round(aggregate.emails_sent / aggregate.meetings_booked).toLocaleString()
                      : "—"
                  }
                />
              </div>
            </div>

            <div className="ct-card">
              <h2>Per-test performance</h2>
              <div className="ct-card-sub">
                Each linked campaign mapped to the test it was launched from.
              </div>
              {linkedPerTest.map(({ run, campaign }) => {
                const test = TESTS.find((t) => t.number === run.test_number);
                return (
                  <div
                    key={run.id}
                    style={{
                      padding: 12,
                      marginBottom: 6,
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>
                        Test {run.test_number} — {test?.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Winner: {run.variant_chosen} · Campaign: {campaign!.name}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                      <MiniStat label="Sent" value={fmtInt(campaign!.send_volume)} />
                      <MiniStat label="Open" value={fmtPct(toFrac(campaign!.open_rate))} />
                      <MiniStat label="Reply" value={fmtPct(toFrac(campaign!.reply_rate))} />
                      <MiniStat label="Positive" value={fmtInt(campaign!.positive_reply_count)} />
                      <MiniStat label="Meet/500" value={fmtDecimal(campaign!.meetings_per_500, 2)} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="ct-card">
              <h2>Signals</h2>
              <div className="ct-card-sub">
                Rule-based diagnostic readout. Use these to decide whether to
                retest, push more volume, or stop and fix a lever.
              </div>
              {triggeredRules.length === 0 ? (
                <div style={{ color: "var(--green)", fontSize: 13 }}>
                  No symptoms fired. Campaigns look healthy — consider scaling.
                </div>
              ) : (
                triggeredRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`ct-alert ${
                      rule.severity === "block"
                        ? "ct-alert-block"
                        : rule.severity === "warn"
                          ? "ct-alert-warn"
                          : "ct-alert-info"
                    }`}
                  >
                    <div style={{ fontWeight: 600 }}>{rule.symptom}</div>
                    <div>Probable cause: {rule.probableCause}</div>
                    <div>Action: {rule.action}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-metric">
      <div className="ct-metric-label">{label}</div>
      <div className="ct-metric-value">{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtDecimal(n: number | null | undefined, digits: number): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}
function toFrac(n: number | null | undefined): number | null {
  if (n == null) return null;
  return n > 1 ? n / 100 : n;
}
