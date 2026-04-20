"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";
import { syncClientsFromExternalSource } from "@/app/actions/sync-clients";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
}

function IconSpark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
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

function IconCloud() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

const SYNC_SESSION_KEY = "agency_intel_client_sync_v1";

export default function HomePage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
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
    loadClients();
  }, [loadClients]);

  const runSync = useCallback(
    async (isAuto: boolean) => {
      setSyncBusy(true);
      setSyncNote(null);
      try {
        const r = await syncClientsFromExternalSource();
        if (!r.ok) {
          setSyncNote(`Sync failed: ${r.error}`);
          return;
        }
        if (r.skipped) {
          if (!isAuto) {
            setSyncNote(r.message);
          }
          return;
        }
        setSyncNote(`Synced ${r.upserted} client(s) from your Reply Handler export.`);
        await loadClients();
      } catch (e) {
        setSyncNote(e instanceof Error ? e.message : "Sync failed");
      } finally {
        setSyncBusy(false);
      }
    },
    [loadClients]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SYNC_SESSION_KEY)) return;
    sessionStorage.setItem(SYNC_SESSION_KEY, "1");
    void runSync(true);
  }, [runSync]);

  return (
    <div className="app-layout">
      <AppSidebar active="home" />
      <div className="content-area" style={{ overflowY: "auto" }}>
        <header className="dash-header">
          <div className="dash-header-brand">
            <div className="dash-logo" aria-hidden>
              <IconSpark />
            </div>
            <div>
              <h1 className="dash-title">Agency Intelligence</h1>
              <p className="dash-tagline">
                Client management + lead database + campaign engine — one control surface for outbound ops.
              </p>
            </div>
          </div>
          <div className="dash-header-actions">
            <button
              type="button"
              className="btn dash-sync-btn"
              disabled={syncBusy}
              onClick={() => runSync(false)}
              title="Pull clients from SalesGlider / Reply Handler (configure EXTERNAL_CLIENTS_SYNC_URL)"
            >
              {syncBusy ? "Syncing…" : "Sync from Reply Handler"}
            </button>
            <Link href="/clients/new" className="btn btn-primary dash-header-cta">
              <IconUsers />
              Add client
            </Link>
          </div>
        </header>

        <div className="dash-page">
          {syncNote && (
            <div className={`dash-sync-banner${syncNote.startsWith("Sync failed") ? " dash-sync-banner-warn" : ""}`}>
              {syncNote}
            </div>
          )}

          <section className="dash-section">
            <div className="dash-section-head">
              <h2>Workspace</h2>
              <p className="dash-section-sub">Jump to the tool for the task — icons match the left rail.</p>
            </div>
            <div className="dash-tile-grid">
              <Link href="/clients/new" className="dash-card dash-card-highlight">
                <div className="dash-card-icon">
                  <IconUsers />
                </div>
                <div className="dash-card-title">Add client</div>
                <p className="dash-card-desc">Create the record and paste API keys so sync can run tonight.</p>
                <span className="dash-card-link">Open →</span>
              </Link>
              <Link href="/clients" className="dash-card">
                <div className="dash-card-icon">
                  <IconUsers />
                </div>
                <div className="dash-card-title">All clients</div>
                <p className="dash-card-desc">Hub per client: contacts shortcuts, new brief, settings context.</p>
                <span className="dash-card-link">Open →</span>
              </Link>
              <Link href="/contacts" className="dash-card">
                <div className="dash-card-icon">
                  <IconSearch />
                </div>
                <div className="dash-card-title">Contacts</div>
                <p className="dash-card-desc">Lead-database filters, exports, and AI-assisted query bar.</p>
                <span className="dash-card-link">Open →</span>
              </Link>
              <Link href="/chat" className="dash-card">
                <div className="dash-card-icon dash-card-icon-accent">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="dash-card-title">AI analyst</div>
                <p className="dash-card-desc">Ask performance questions grounded in your warehouse data.</p>
                <span className="dash-card-link">Open →</span>
              </Link>
              <Link href="/campaign-tester" className="dash-card">
                <div className="dash-card-icon dash-card-icon-accent">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 2v7.31M14 9.3V2M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.5 16h13" />
                  </svg>
                </div>
                <div className="dash-card-title">Campaign tester</div>
                <p className="dash-card-desc">Wizard + structured tests before you scale creative.</p>
                <span className="dash-card-link">Open →</span>
              </Link>
              <Link href="/campaign-tester/strategy" className="dash-card">
                <div className="dash-card-icon dash-card-icon-accent">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v6" />
                    <path d="M12 16v6" />
                    <path d="M4 8h16" />
                    <path d="M4 16h16" />
                  </svg>
                </div>
                <div className="dash-card-title">Client onboarding</div>
                <p className="dash-card-desc">Define ICP lanes + offer library once per client.</p>
                <span className="dash-card-link">Open →</span>
              </Link>
            </div>
          </section>

          <section className="dash-section">
            <div className="dash-section-head">
              <h2>Your clients</h2>
              <p className="dash-section-sub">Quick links into their hub, contacts, and new brief.</p>
            </div>
            {loading ? (
              <p className="dash-muted">Loading…</p>
            ) : clients.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon" aria-hidden>
                  <IconUsers />
                </div>
                <p>
                  <strong>No clients yet.</strong> Add one to connect SmartLead / HeyReach and unlock sync.
                </p>
                <Link href="/clients/new" className="btn btn-primary">
                  Add your first client
                </Link>
              </div>
            ) : (
              <ul className="dash-client-cards">
                {clients.map((c) => (
                  <li key={c.id} className="dash-client-card">
                    <div className="dash-client-card-main">
                      <Link href={`/clients/${c.id}`} className="dash-client-card-name">
                        {c.name}
                      </Link>
                      {c.industry_vertical && (
                        <span className="dash-client-card-badge">{c.industry_vertical}</span>
                      )}
                    </div>
                    <div className="dash-client-card-actions">
                      <Link href={`/contacts?client_id=${encodeURIComponent(c.id)}`}>Contacts</Link>
                      <Link href={`/campaign-tester/new?client_id=${encodeURIComponent(c.id)}`}>New brief</Link>
                      <Link href={`/clients/${c.id}`}>Hub →</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="dash-footnote">
            <strong>Tip:</strong> Use the <strong>Guide</strong> button at the bottom-right for product how-tos. It uses
            the documented playbook (RAG-style), not live metrics — for numbers, open <Link href="/chat">AI analyst</Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
