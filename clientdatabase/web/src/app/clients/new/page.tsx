"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

export default function NewClientPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [smartlead, setSmartlead] = useState("");
  const [heyreach, setHeyreach] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          industry_vertical: industry.trim() || null,
          smartlead_api_key: smartlead.trim() || null,
          heyreach_api_key: heyreach.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create client.");
        setSubmitting(false);
        return;
      }
      router.push(`/clients/${data.client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSubmitting(false);
    }
  }

  return (
    <div className="app-layout">
      <AppSidebar active="clients" />
      <div className="ct-shell" style={{ maxWidth: 560 }}>
        <div className="ct-crumbs">
          <Link href="/">Home</Link> / <Link href="/clients">Clients</Link> / New
        </div>
        <div className="ct-header">
          <h1>Add client</h1>
          <div className="ct-sub">
            After saving, the nightly Railway sync can pick up this row and ingest campaigns. Keys stay in Supabase —
            you can add them later from the client hub.
          </div>
        </div>

        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="ct-card">
            <h2>Client details</h2>
            <div className="ct-field">
              <label>
                Client name <span style={{ color: "var(--red)" }}>*</span>
              </label>
              <input
                className="ct-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme MSP"
                autoComplete="organization"
              />
            </div>
            <div className="ct-field">
              <label>Industry vertical</label>
              <input
                className="ct-input"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Cybersecurity, Staffing"
              />
            </div>
            <div className="ct-field">
              <label>SmartLead API key</label>
              <input
                className="ct-input"
                type="password"
                value={smartlead}
                onChange={(e) => setSmartlead(e.target.value)}
                placeholder="Optional — sub-account API key"
                autoComplete="off"
              />
            </div>
            <div className="ct-field">
              <label>HeyReach API key</label>
              <input
                className="ct-input"
                type="password"
                value={heyreach}
                onChange={(e) => setHeyreach(e.target.value)}
                placeholder="Optional"
                autoComplete="off"
              />
            </div>
            <div className="ct-field">
              <label>Notes</label>
              <textarea
                className="ct-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes"
                rows={3}
              />
            </div>
          </div>
          <div className="ct-actions" style={{ marginTop: 16 }}>
            <Link href="/clients" className="btn" style={{ textDecoration: "none" }}>
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
