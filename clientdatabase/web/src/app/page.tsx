"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
  created_at?: string;
  sync_enabled?: boolean | null;
  has_smartlead_key?: boolean;
  has_heyreach_key?: boolean;
  has_booking_link?: boolean;
}

function IconPlane() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 2L11 13" strokeLinecap="round" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export default function HomePage() {
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
      <AppSidebar active="home" />
      <div className="content-area" style={{ overflowY: "auto" }}>
        <div className="rh-dash">
          <header className="rh-dash-header">
            <div className="rh-dash-brand">
              <div className="rh-dash-logo" aria-hidden>
                <IconPlane />
              </div>
              <div>
                <h1 className="rh-dash-title">
                  SalesGlider <span className="rh-dash-title-sub">AI Reply Handler</span>
                </h1>
                <p className="rh-dash-tagline">Client management and platform connections.</p>
              </div>
            </div>
            <div className="rh-dash-actions">
              <Link href="/clients/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
                <IconUsers />
                Add client
              </Link>
            </div>
          </header>

          <div className="rh-dash-body">
            <div className="sg-stats-grid">
              <StatTile label="TOTAL CLIENTS" value={stats.total} />
              <StatTile label="ACTIVE" value={stats.active} highlight />
              <StatTile label="SMARTLEAD CONNECTED" value={stats.smartleadConnected} />
              <StatTile label="HEYREACH CONNECTED" value={stats.heyreachConnected} />
            </div>

            <div className="rh-section">
              <div className="rh-section-head">
                <h2 className="rh-section-title">Clients</h2>
                <button className="btn rh-refresh" type="button" onClick={refresh} disabled={loading || refreshing}>
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {loading ? (
                <div className="rh-card-skeleton">
                  <div className="skeleton" style={{ width: "40%", marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: "70%" }} />
                </div>
              ) : clients.length === 0 ? (
                <div className="rh-empty">
                  <IconUsers />
                  <p>
                    <strong>No clients yet.</strong> Add one to connect SmartLead / HeyReach.
                  </p>
                  <Link href="/clients/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
                    Add your first client
                  </Link>
                </div>
              ) : (
                <ul className="sg-client-cards">
                  {clients.map((c) => (
                    <li key={c.id} className="sg-client-card">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="sg-client-card-top">
                          <Link href={`/clients/${c.id}`} className="sg-client-name">
                            {c.name}
                          </Link>
                          <StatusPill ok={c.sync_enabled !== false} label="ACTIVE" />
                        </div>
                        <div className="sg-client-checks sg-client-checks-grid">
                          <Check ok={Boolean(c.has_smartlead_key)} label="SmartLead" />
                          <Check ok={Boolean(c.has_booking_link)} label="Booking link" />
                          <Check ok={Boolean(c.has_heyreach_key)} label="HeyReach" />
                        </div>
                        {c.created_at && (
                          <div className="sg-client-added">Added {formatAdded(c.created_at)}</div>
                        )}
                      </div>
                      <div className="sg-client-actions">
                        <Link href={`/contacts?client_id=${encodeURIComponent(c.id)}`} className="sg-link">
                          Contacts
                        </Link>
                        <Link href={`/campaign-tester/new?client_id=${encodeURIComponent(c.id)}`} className="sg-link">
                          New campaign
                        </Link>
                        <Link href={`/clients/${c.id}`} className="sg-link">
                          Hub
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="rh-quick-links">
              Quick links:{" "}
              <Link href="/contacts">Contacts</Link>
              {" · "}
              <Link href="/chat">AI analyst</Link>
              {" · "}
              <Link href="/intelligence">Intelligence</Link>
              {" · "}
              <Link href="/campaign-tester">Campaign tester</Link>
              {" · "}
              <Link href="/campaign-tester/strategy">Client onboarding</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`sg-stat-tile${highlight ? " sg-stat-tile-highlight" : ""}`}>
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

function formatAdded(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
