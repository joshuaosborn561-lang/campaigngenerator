"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type ClientHub = {
  id: string;
  name: string;
  industry_vertical: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  has_smartlead_key: boolean;
  has_heyreach_key: boolean;
};

type LiveCampaign = {
  id: string;
  name: string | null;
  source_platform: string | null;
  status: string | null;
  send_volume: number | null;
  reply_rate: number | null;
};

export default function ClientHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<ClientHub | null>(null);
  const [stats, setStats] = useState<{ campaigns: number; briefs: number } | null>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSmartlead, setEditSmartlead] = useState("");
  const [editHeyreach, setEditHeyreach] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingCam, setDeletingCam] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/clients/${id}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Failed to load");
          return;
        }
        if (!cancelled) {
          setClient(data.client);
          setStats(data.stats);
          setEditName(data.client.name);
          setEditIndustry(data.client.industry_vertical ?? "");
          setEditNotes(data.client.notes ?? "");
          setEditSmartlead("");
          setEditHeyreach("");
        }
        const cRes = await fetch(`/api/campaigns?client_id=${encodeURIComponent(id)}`);
        const cJson = await cRes.json();
        if (!cancelled) {
          if (cRes.ok) {
            setLiveCampaigns(cJson.campaigns ?? []);
          } else {
            setLiveCampaigns([]);
          }
        }
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function removeClient() {
    if (deleting || !client) return;
    if (
      !window.confirm(
        `Delete “${client.name}”? This removes strategies, ICP, live synced campaigns, and (after DB migration) campaign briefs.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Delete failed. Apply Supabase migration 020 if this fails on briefs.");
        setDeleting(false);
        return;
      }
      router.push("/clients");
    } catch {
      alert("Network error");
    } finally {
      setDeleting(false);
    }
  }

  async function removeLiveCampaign(camId: string) {
    if (deletingCam) return;
    if (!window.confirm("Remove this live campaign from the database? Lead rows in this app will be deleted with it.")) {
      return;
    }
    setDeletingCam(camId);
    try {
      const res = await fetch(`/api/campaigns/${camId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Delete failed");
        return;
      }
      setLiveCampaigns((rows) => rows.filter((c) => c.id !== camId));
      if (stats) {
        setStats((s) => (s ? { ...s, campaigns: Math.max(0, s.campaigns - 1) } : s));
      }
    } catch {
      alert("Network error");
    } finally {
      setDeletingCam(null);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, string | null> = {
        name: editName.trim(),
        industry_vertical: editIndustry.trim() || null,
        notes: editNotes.trim() || null,
      };
      if (editSmartlead.trim()) body.smartlead_api_key = editSmartlead.trim();
      if (editHeyreach.trim()) body.heyreach_api_key = editHeyreach.trim();

      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg(data.error ?? "Save failed");
        setSaving(false);
        return;
      }
      const fresh = await fetch(`/api/clients/${id}`);
      const freshJson = await fresh.json();
      if (fresh.ok && freshJson.client) {
        setClient(freshJson.client);
        setStats(freshJson.stats);
        setEditName(freshJson.client.name);
        setEditIndustry(freshJson.client.industry_vertical ?? "");
        setEditNotes(freshJson.client.notes ?? "");
      } else {
        setClient((c) =>
          c
            ? {
                ...c,
                name: data.client.name,
                industry_vertical: data.client.industry_vertical,
                notes: data.client.notes,
                updated_at: data.client.updated_at,
              }
            : null
        );
      }
      setEditSmartlead("");
      setEditHeyreach("");
      setSaveMsg("Saved.");
    } catch {
      setSaveMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-layout">
      <AppSidebar active="clients" />
      <div className="ct-shell" style={{ maxWidth: 720 }}>
        <div className="ct-crumbs">
          <Link href="/">Home</Link> / <Link href="/clients">Clients</Link>
          {client && ` / ${client.name}`}
        </div>

        {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
        {error && <div className="ct-alert ct-alert-block">{error}</div>}

        {client && stats && (
          <>
            <div className="ct-header">
              <h1>{client.name}</h1>
              <div className="ct-sub">
                {stats.campaigns} synced campaign{stats.campaigns === 1 ? "" : "s"} · {stats.briefs} campaign brief
                {stats.briefs === 1 ? "" : "s"}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              <Link href={`/chat?view=contacts&client_id=${encodeURIComponent(id)}`} className="btn btn-primary" style={{ textDecoration: "none" }}>
                AI Analyst — search
              </Link>
              <Link
                href={`/campaign-tester/onboarding?client_id=${encodeURIComponent(id)}`}
                className="btn"
                style={{ textDecoration: "none" }}
              >
                Guided new client
              </Link>
              <Link href={`/campaign-tester/strategy?client_id=${encodeURIComponent(id)}`} className="btn" style={{ textDecoration: "none" }}>
                Client strategy
              </Link>
              <Link href={`/campaign-tester/new?client_id=${encodeURIComponent(id)}`} className="btn" style={{ textDecoration: "none" }}>
                New campaign brief
              </Link>
              <Link href="/chat" className="btn" style={{ textDecoration: "none" }}>
                AI Analyst — ask
              </Link>
            </div>

            {liveCampaigns.length > 0 && (
              <div className="ct-card" style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Live campaigns (synced to DB)</h2>
                <p className="ct-wizard-help" style={{ marginBottom: 10, fontSize: 12 }}>
                  This is the warehouse from SmartLead / HeyReach. Deleting only removes the copy in Supabase, not
                  the campaign in the vendor app.
                </p>
                <ul className="ct-list" style={{ margin: 0 }}>
                  {liveCampaigns.map((c) => (
                    <li key={c.id} style={{ alignItems: "center" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ct-list-label">{c.name || "Unnamed"}</div>
                        <div className="ct-list-sub">
                          {c.source_platform || "—"} · {c.status || "—"} · sends {c.send_volume ?? "—"} · reply{" "}
                          {c.reply_rate != null ? `${c.reply_rate.toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: 11, color: "var(--red, #f87171)" }}
                        onClick={() => void removeLiveCampaign(c.id)}
                        disabled={deletingCam === c.id}
                      >
                        {deletingCam === c.id ? "…" : "Delete copy"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="ct-alert ct-alert-info" style={{ marginBottom: 16 }}>
              Sync runs from Railway using keys on this client. After keys are set, deploy or trigger your{" "}
              <code style={{ fontSize: 11 }}>sync/</code> service — or run <code style={{ fontSize: 11 }}>npm run historical</code> locally once.
              <br />
              <br />
              <strong>Calendly (verified meetings):</strong> webhook{" "}
              <code style={{ fontSize: 11 }}>/api/webhooks/calendly</code>; migrations{" "}
              <code style={{ fontSize: 11 }}>006</code>, <code style={{ fontSize: 11 }}>007</code>,{" "}
              <code style={{ fontSize: 11 }}>008</code>. Use{" "}
              <code style={{ fontSize: 11 }}>CALENDLY_ACCOUNT_MAP</code> so events from <em>your</em> Calendly org vs a{" "}
              <em>client&apos;s</em> org set <code style={{ fontSize: 11 }}>inferred_client_id</code> correctly; use{" "}
              <code style={{ fontSize: 11 }}>CALENDLY_WEBHOOK_SIGNING_KEYS</code> when both orgs subscribe with different
              signing secrets. Optional <code style={{ fontSize: 11 }}>CALENDLY_AGENCY_*</code> for internal invitees on a
              shared calendar.
            </div>

            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Settings</h2>
            {saveMsg && (
              <div className={`ct-alert ${saveMsg === "Saved." ? "ct-alert-info" : "ct-alert-block"}`} style={{ marginBottom: 12 }}>
                {saveMsg}
              </div>
            )}
            <form onSubmit={saveProfile}>
              <div className="ct-card">
                <div className="ct-field">
                  <label>Name</label>
                  <input className="ct-input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="ct-field">
                  <label>Industry vertical</label>
                  <input className="ct-input" value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)} />
                </div>
                <div className="ct-field">
                  <label>Notes</label>
                  <textarea className="ct-textarea" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 8px" }}>
                  API keys: leave blank to keep existing. SmartLead: {client.has_smartlead_key ? "on file" : "not set"} · HeyReach:{" "}
                  {client.has_heyreach_key ? "on file" : "not set"}
                </p>
                <div className="ct-field">
                  <label>New SmartLead API key</label>
                  <input
                    className="ct-input"
                    type="password"
                    value={editSmartlead}
                    onChange={(e) => setEditSmartlead(e.target.value)}
                    placeholder="Paste only to replace"
                    autoComplete="off"
                  />
                </div>
                <div className="ct-field">
                  <label>New HeyReach API key</label>
                  <input
                    className="ct-input"
                    type="password"
                    value={editHeyreach}
                    onChange={(e) => setEditHeyreach(e.target.value)}
                    placeholder="Paste only to replace"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="ct-actions" style={{ marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
            <div className="ct-card" style={{ borderColor: "var(--red, #f87171)" }}>
              <h2 style={{ fontSize: 15, color: "var(--red, #f87171)" }}>Delete client</h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Permanently remove this client from the app. Requires running migration{" "}
                <code style={{ fontSize: 11 }}>020_campaign_briefs_client_cascade</code> on Supabase so
                related briefs are removed. SmartLead and HeyReach campaigns in those tools are
                not deleted — only the warehouse copy here.
              </p>
              <button
                type="button"
                className="btn"
                style={{ borderColor: "var(--red, #f87171)", color: "var(--red, #f87171)" }}
                onClick={removeClient}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete this client…"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
