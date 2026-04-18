"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface ClientRow {
  id: string;
  name: string;
  industry_vertical: string | null;
  created_at?: string;
}

export default function ClientsDirectoryPage() {
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
      <AppSidebar active="clients" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/">Home</Link> / Clients
        </div>
        <div className="ct-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1>Clients</h1>
            <div className="ct-sub">
              Each client row in Supabase drives SmartLead / HeyReach sync. Add keys here instead of raw SQL.
            </div>
          </div>
          <Link href="/clients/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Add client
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : clients.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No clients yet.{" "}
            <Link href="/clients/new" style={{ color: "var(--accent)" }}>
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="ct-list" style={{ maxWidth: 720 }}>
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="ct-list-label" style={{ textDecoration: "none", color: "inherit" }}>
                  {c.name}
                  {c.industry_vertical && (
                    <span className="ct-list-sub" style={{ display: "block", marginTop: 4 }}>
                      {c.industry_vertical}
                    </span>
                  )}
                </Link>
                <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                  <Link href={`/contacts?client_id=${encodeURIComponent(c.id)}`} style={{ color: "var(--accent)" }}>
                    Contacts
                  </Link>
                  <Link href={`/campaign-tester/new?client_id=${encodeURIComponent(c.id)}`} style={{ color: "var(--accent)" }}>
                    New brief
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
