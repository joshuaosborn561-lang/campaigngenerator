"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
  created_at?: string;
  sync_enabled?: boolean;
  has_smartlead_key?: boolean;
  has_heyreach_key?: boolean;
}

export default function ClientsDirectoryPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setClients(data.clients ?? []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = clients.length;
    const active = clients.filter((c) => c.sync_enabled !== false).length;
    const smartleadConnected = clients.filter((c) => Boolean(c.has_smartlead_key)).length;
    const heyreachConnected = clients.filter((c) => Boolean(c.has_heyreach_key)).length;
    return { total, active, smartleadConnected, heyreachConnected };
  }, [clients]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  return (
    <div className="app-layout">
      <AppSidebar active="clients" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/">Home</Link> / Clients
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div className="ct-header" style={{ marginBottom: 0 }}>
            <h1 style={{ marginBottom: 4 }}>SalesGlider AI Reply Handler</h1>
            <div className="ct-sub">Client management + platform connections.</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" type="button" onClick={refresh} disabled={loading || refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <Link href="/clients/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Add client
            </Link>
          </div>
        </div>

        <div className="sg-stats-grid" style={{ marginBottom: 18 }}>
          <StatTile label="Total clients" value={stats.total} />
          <StatTile label="Active" value={stats.active} />
          <StatTile label="SmartLead connected" value={stats.smartleadConnected} />
          <StatTile label="HeyReach connected" value={stats.heyreachConnected} />
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
            Clients
          </div>
          {loading ? (
            <div className="ct-card">
              <div className="skeleton" style={{ width: "40%", marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "70%" }} />
            </div>
          ) : clients.length === 0 ? (
            <div className="ct-card">
              <div className="empty-state" style={{ padding: 28 }}>
                <div className="empty-state-title">No clients yet</div>
                <div>Add a client to connect SmartLead/HeyReach and start syncing.</div>
                <div style={{ marginTop: 12 }}>
                  <Link href="/clients/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
                    Add client
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <ul className="sg-client-cards">
              {clients.map((c) => (
                <li key={c.id} className="sg-client-card">
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/clients/${c.id}`} className="sg-client-name">
                      {c.name}
                    </Link>
                    <div className="sg-client-meta">
                      <StatusPill ok={c.sync_enabled !== false} label={c.sync_enabled === false ? "inactive" : "active"} />
                      {c.industry_vertical ? <span className="sg-client-vertical">{c.industry_vertical}</span> : null}
                    </div>
                    <div className="sg-client-checks">
                      <Check ok={Boolean(c.has_smartlead_key)} label="SmartLead" />
                      <Check ok={Boolean(c.has_heyreach_key)} label="HeyReach" />
                    </div>
                  </div>
                  <div className="sg-client-actions">
                    <Link href={`/contacts?client_id=${encodeURIComponent(c.id)}`} className="sg-link">
                      Contacts
                    </Link>
                    <Link href={`/campaign-tester/new?client_id=${encodeURIComponent(c.id)}`} className="sg-link">
                      New campaign
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="sg-stat-tile">
      <div className="sg-stat-label">{label}</div>
      <div className="sg-stat-value">{value.toLocaleString()}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`sg-pill ${ok ? "sg-pill-ok" : "sg-pill-muted"}`}>
      {label}
    </span>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`sg-check ${ok ? "sg-check-ok" : "sg-check-missing"}`}>
      <span aria-hidden>{ok ? "✓" : "—"}</span>
      <span>{label}</span>
    </span>
  );
}
