"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
}

interface BriefRow {
  id: string;
  name: string;
  client_id: string | null;
  target_industry: string | null;
  icp_job_title: string | null;
  icp_company_size: string | null;
  status: "in_progress" | "complete" | "abandoned";
  created_at: string;
  clients?: ClientRow | null;
}

export default function CampaignTesterListPage() {
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState<string>("");

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = clientFilter ? `?client_id=${encodeURIComponent(clientFilter)}` : "";
        const res = await fetch(`/api/campaign-tester/briefs${qs}`);
        const data = await res.json();
        setBriefs(data.briefs ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientFilter]);

  // Group by client name so the list reads like a book of work per client.
  const grouped = useMemo(() => {
    const byClient = new Map<string, { name: string; rows: BriefRow[] }>();
    for (const b of briefs) {
      const key = b.client_id ?? "__none__";
      const name = b.clients?.name ?? "Unassigned / internal";
      if (!byClient.has(key)) byClient.set(key, { name, rows: [] });
      byClient.get(key)!.rows.push(b);
    }
    return [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [briefs]);

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-header">
          <h1>Campaign Testing Machine</h1>
          <div className="ct-sub">
            Run the 6-test framework per client. Every completed test is saved
            — once you link it to a live campaign, SmartLead&apos;s nightly
            sync will feed back performance automatically.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <Link href="/campaign-tester/new" className="btn btn-primary">
            + New Campaign Brief
          </Link>
          <div style={{ marginLeft: "auto" }}>
            <select
              className="ct-select"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={{ minWidth: 220 }}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="ct-card">
            <div className="skeleton" style={{ width: "40%", marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "70%" }} />
          </div>
        ) : briefs.length === 0 ? (
          <div className="ct-card">
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-state-title">No campaign briefs yet</div>
              <div>Click &quot;New Campaign Brief&quot; to kick off your first test cycle.</div>
            </div>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.name} style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--text-muted)",
                  margin: "8px 4px",
                }}
              >
                {group.name} — {group.rows.length} brief{group.rows.length === 1 ? "" : "s"}
              </div>
              <ul className="ct-list">
                {group.rows.map((b) => (
                  <li key={b.id}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="ct-list-label">
                        <Link href={`/campaign-tester/${b.id}`} style={{ color: "var(--text-primary)" }}>
                          {b.name}
                        </Link>
                      </div>
                      <div className="ct-list-sub">
                        {[b.target_industry, b.icp_job_title, b.icp_company_size]
                          .filter(Boolean)
                          .join(" · ") || "No ICP set"}
                      </div>
                    </div>
                    <span
                      className={`ct-chip ${
                        b.status === "complete"
                          ? "ct-chip-pass"
                          : b.status === "abandoned"
                            ? "ct-chip-fail"
                            : "ct-chip-todo"
                      }`}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                    <Link className="btn" href={`/campaign-tester/${b.id}`}>Open</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
