"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
}

export default function HomePage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clients");
        const data = await res.json();
        setClients(data.clients ?? []);
      } catch {
        setClients([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="app-layout">
      <AppSidebar active="home" />
      <div className="content-area" style={{ overflowY: "auto" }}>
        <div className="top-bar">
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Agency Intelligence Platform</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)", maxWidth: 640 }}>
              Onboard clients, sync SmartLead / HeyReach into Supabase, search contacts like Apollo, ask the AI analyst
              about performance, and run the cold-email campaign testing wizard — all in one place.
            </p>
          </div>
        </div>

        <div style={{ padding: "20px 24px 48px", maxWidth: 960 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
              marginBottom: 28,
            }}
          >
            <Link href="/clients/new" className="dash-tile dash-tile-primary">
              <span className="dash-tile-title">Add client</span>
              <span className="dash-tile-desc">Name, vertical, API keys — then nightly sync can pull campaigns.</span>
            </Link>
            <Link href="/contacts" className="dash-tile">
              <span className="dash-tile-title">Contacts</span>
              <span className="dash-tile-desc">Unified database search, filters, and Apollo CSV diff prep.</span>
            </Link>
            <Link href="/chat" className="dash-tile">
              <span className="dash-tile-title">AI analyst</span>
              <span className="dash-tile-desc">Natural language over campaigns, sequences, and reply stats.</span>
            </Link>
            <Link href="/campaign-tester" className="dash-tile">
              <span className="dash-tile-title">Campaign tester</span>
              <span className="dash-tile-desc">Brief → ICP → offers → six structured copy tests.</span>
            </Link>
            <Link href="/import" className="dash-tile">
              <span className="dash-tile-title">Apollo import</span>
              <span className="dash-tile-desc">Mark new vs existing contacts before you reveal emails.</span>
            </Link>
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>
            Your clients
          </h2>
          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</p>
          ) : clients.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 8,
                border: "1px dashed var(--border-light)",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No clients yet.{" "}
              <Link href="/clients/new" style={{ color: "var(--accent)" }}>
                Add your first client
              </Link>{" "}
              to connect SmartLead / HeyReach and start syncing.
            </div>
          ) : (
            <ul className="dash-client-list">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="dash-client-link">
                    <span className="dash-client-name">{c.name}</span>
                    {c.industry_vertical && (
                      <span className="dash-client-meta">{c.industry_vertical}</span>
                    )}
                  </Link>
                  <div className="dash-client-actions">
                    <Link href={`/contacts?client_id=${encodeURIComponent(c.id)}`}>Contacts</Link>
                    <Link href={`/campaign-tester/new?client_id=${encodeURIComponent(c.id)}`}>New brief</Link>
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
