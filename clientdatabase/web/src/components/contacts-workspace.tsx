"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import type { SidebarActive } from "@/components/AppSidebar";

// ─── Types ───────────────────────────────────────────────────
interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_industry: string | null;
  company_size: string | null;
  company_revenue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  tags: string[] | null;
  source_platform: string | null;
  source_list: string | null;
  total_campaigns: number;
  total_emails_sent: number;
  total_replies: number;
  overall_status: string | null;
  meeting_booked: boolean;
  last_contacted_at: string | null;
  created_at: string;
}

interface Filters {
  title?: string;
  seniority?: string;
  department?: string;
  company?: string;
  industry?: string;
  size?: string;
  country?: string;
  state?: string;
  city?: string;
  status?: string;
  source?: string;
  meeting?: string;
  [key: string]: string | undefined;
}

// ─── Constants ───────────────────────────────────────────────
const SENIORITY_OPTIONS = ["", "c-suite", "vp", "director", "manager", "senior", "entry"];
const DEPARTMENT_OPTIONS = ["", "sales", "marketing", "engineering", "it", "operations", "hr", "finance", "legal", "product", "design", "customer_success", "executive", "security"];
const SIZE_OPTIONS = ["", "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"];
const STATUS_OPTIONS = ["", "new", "contacted", "engaged", "replied", "meeting_booked", "customer", "do_not_contact"];
const SOURCE_OPTIONS = ["", "smartlead", "heyreach", "manual", "csv"];

const BADGE_CLASS: Record<string, string> = {
  new: "badge-new",
  contacted: "badge-contacted",
  engaged: "badge-engaged",
  replied: "badge-replied",
  meeting_booked: "badge-meeting",
  customer: "badge-customer",
  do_not_contact: "badge-dnc",
};

interface ClientOpt {
  id: string;
  name: string;
  industry_vertical: string | null;
}

export type ContactsWorkspaceProps = {
  /** Sidebar highlight: use "chat" when this panel is under AI Analyst. */
  sidebarActive?: SidebarActive;
  /** Base path for URL updates when client scope changes (default `/chat`). */
  basePath?: string;
  /** When set, shows a control to return to the Ask tab (AI Analyst). */
  onBackToAsk?: () => void;
};

// ─── Component ───────────────────────────────────────────────
export function ContactsWorkspace({
  sidebarActive = "chat",
  basePath = "/chat",
  onBackToAsk,
}: ContactsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdFilter = searchParams.get("client_id") ?? "";

  const [clientOptions, setClientOptions] = useState<ClientOpt[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clients");
        const data = await res.json();
        setClientOptions(data.clients ?? []);
      } catch {
        setClientOptions([]);
      }
    })();
  }, []);

  // ─── Fetch contacts ──────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    params.set("sort", sortCol);
    params.set("order", sortAsc ? "asc" : "desc");
    if (search) params.set("q", search);
    if (clientIdFilter) params.set("client_id", clientIdFilter);

    for (const [key, val] of Object.entries(filters)) {
      if (val) params.set(key, val);
    }

    try {
      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      setContacts(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 0);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sortCol, sortAsc, search, filters, clientIdFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ─── Debounced search ────────────────────────────────────
  function handleSearchInput(val: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  }

  // ─── Sort ────────────────────────────────────────────────
  function handleSort(col: string) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
    setPage(1);
  }

  // ─── Filter change ──────────────────────────────────────
  function setFilter(key: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  }

  function clearFilters() {
    setFilters({});
    setSearch("");
    setPage(1);
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ─── Selection ──────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  }

  // ─── CSV Export ─────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const body: any = {};
      if (selected.size > 0) {
        body.ids = Array.from(selected);
      } else {
        body.filters = { ...filters, q: search || undefined };
      }

      const res = await fetch("/api/contacts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  }

  // ─── AI Search ──────────────────────────────────────────
  async function handleAiSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!aiQuery.trim() || aiLoading) return;

    setAiLoading(true);
    setAiMessage("");

    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery.trim() }),
      });
      const data = await res.json();

      if (data.filters) {
        setFilters(data.filters);
        setPage(1);
        const filterDesc = Object.entries(data.filters)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        setAiMessage(`Applied filters: ${filterDesc}`);
        setAiQuery("");
      } else if (data.error) {
        setAiMessage(`Error: ${data.error}`);
      }
    } catch {
      setAiMessage("AI search failed. Check your configuration.");
    } finally {
      setAiLoading(false);
    }
  }

  // ─── Helpers ────────────────────────────────────────────
  function initials(c: Contact) {
    return ((c.first_name?.[0] || "") + (c.last_name?.[0] || "")).toUpperCase() || "?";
  }

  function location(c: Contact) {
    return [c.city, c.state, c.country].filter(Boolean).join(", ");
  }

  function sortIndicator(col: string) {
    if (sortCol !== col) return "";
    return sortAsc ? " \u25B2" : " \u25BC";
  }

  function onClientScopeChange(nextId: string) {
    const qs = new URLSearchParams();
    qs.set("view", "contacts");
    if (nextId) qs.set("client_id", nextId);
    router.replace(`${basePath}?${qs.toString()}`);
    setPage(1);
  }

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="app-layout">
      <AppSidebar active={sidebarActive} />

      {/* Filter sidebar */}
      <aside className="filter-panel">
        {onBackToAsk && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            <button type="button" className="btn" style={{ width: "100%", fontSize: 12 }} onClick={onBackToAsk}>
              ← Ask data
            </button>
          </div>
        )}
        <div className="filter-panel-header">
          <span>Filters {activeFilterCount > 0 && `(${activeFilterCount})`}</span>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12 }}>
              Clear all
            </button>
          )}
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Client scope</div>
          <select
            className="filter-input"
            value={clientIdFilter}
            onChange={(e) => onClientScopeChange(e.target.value)}
          >
            <option value="">All prospects (agency-wide)</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.industry_vertical ? ` · ${c.industry_vertical}` : ""}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Scoped view uses campaigns linked to this client.{" "}
            <Link href="/clients/new" style={{ color: "var(--accent)" }}>
              Add client
            </Link>
          </p>
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Job Title</div>
          <input
            className="filter-input"
            placeholder="e.g. VP of Sales, CTO..."
            value={filters.title || ""}
            onChange={(e) => setFilter("title", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Seniority</div>
          <select className="filter-select" value={filters.seniority || ""} onChange={(e) => setFilter("seniority", e.target.value)}>
            {SENIORITY_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any"}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Department</div>
          <select className="filter-select" value={filters.department || ""} onChange={(e) => setFilter("department", e.target.value)}>
            {DEPARTMENT_OPTIONS.map((o) => <option key={o} value={o}>{o ? o.replace(/_/g, " ") : "Any"}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Company</div>
          <input
            className="filter-input"
            placeholder="Company name..."
            value={filters.company || ""}
            onChange={(e) => setFilter("company", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Industry</div>
          <input
            className="filter-input"
            placeholder="e.g. MSP, SaaS, Cyber..."
            value={filters.industry || ""}
            onChange={(e) => setFilter("industry", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Company Size</div>
          <select className="filter-select" value={filters.size || ""} onChange={(e) => setFilter("size", e.target.value)}>
            {SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any"}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Location</div>
          <input
            className="filter-input"
            placeholder="Country..."
            value={filters.country || ""}
            onChange={(e) => setFilter("country", e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <input
            className="filter-input"
            placeholder="State..."
            value={filters.state || ""}
            onChange={(e) => setFilter("state", e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <input
            className="filter-input"
            placeholder="City..."
            value={filters.city || ""}
            onChange={(e) => setFilter("city", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Status</div>
          <select className="filter-select" value={filters.status || ""} onChange={(e) => setFilter("status", e.target.value)}>
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o ? o.replace(/_/g, " ") : "Any"}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Source</div>
          <select className="filter-select" value={filters.source || ""} onChange={(e) => setFilter("source", e.target.value)}>
            {SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any"}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-group-label">Meeting Booked</div>
          <select className="filter-select" value={filters.meeting || ""} onChange={(e) => setFilter("meeting", e.target.value)}>
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </aside>

      {/* Main content */}
      <div className="content-area">
        {/* Top bar with search + AI */}
        <div className="top-bar">
          <div className="search-box">
            <span className="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              placeholder="Search contacts by name..."
              defaultValue={search}
              onChange={(e) => handleSearchInput(e.target.value)}
            />
          </div>

          <form className="ai-bar" onSubmit={handleAiSearch}>
            <span className="ai-bar-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            <input
              placeholder="AI: find me MSP owners..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              disabled={aiLoading}
            />
            <button type="submit" className="ai-bar-btn" disabled={aiLoading || !aiQuery.trim()}>
              {aiLoading ? "..." : "Go"}
            </button>
          </form>
        </div>

        {/* AI response message */}
        {aiMessage && (
          <div className="ai-response">
            <span className="ai-response-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            <span>{aiMessage}</span>
            <button className="ai-response-close" onClick={() => setAiMessage("")}>&times;</button>
          </div>
        )}

        {/* Active filter tags */}
        {activeFilterCount > 0 && (
          <div style={{ padding: "4px 20px 0", display: "flex", flexWrap: "wrap", gap: 4 }}>
            {Object.entries(filters).map(([key, val]) =>
              val ? (
                <span key={key} className="filter-tag">
                  {key}: {val}
                  <button onClick={() => setFilter(key, "")}>&times;</button>
                </span>
              ) : null
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="toolbar">
          <span className="toolbar-count">
            {total.toLocaleString()} prospect{total !== 1 ? "s" : ""}
            {selected.size > 0 && ` \u00B7 ${selected.size} selected`}
          </span>
          <span className="toolbar-spacer" />
          <button className="btn" onClick={handleExport} disabled={exporting}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? "Exporting..." : selected.size > 0 ? `Export ${selected.size}` : "Export CSV"}
          </button>
        </div>

        {/* Data table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <div className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={contacts.length > 0 && selected.size === contacts.length}
                      onChange={toggleSelectAll}
                    />
                  </div>
                </th>
                <th className={`col-name${sortCol === "full_name" ? " sorted" : ""}`} onClick={() => handleSort("full_name")}>
                  Name{sortIndicator("full_name")}
                </th>
                <th className={`col-title${sortCol === "title" ? " sorted" : ""}`} onClick={() => handleSort("title")}>
                  Title{sortIndicator("title")}
                </th>
                <th className={`col-company${sortCol === "company_name" ? " sorted" : ""}`} onClick={() => handleSort("company_name")}>
                  Company{sortIndicator("company_name")}
                </th>
                <th className={`col-industry${sortCol === "company_industry" ? " sorted" : ""}`} onClick={() => handleSort("company_industry")}>
                  Industry{sortIndicator("company_industry")}
                </th>
                <th className={`col-size${sortCol === "company_size" ? " sorted" : ""}`} onClick={() => handleSort("company_size")}>
                  Size{sortIndicator("company_size")}
                </th>
                <th className={`col-seniority${sortCol === "seniority" ? " sorted" : ""}`} onClick={() => handleSort("seniority")}>
                  Seniority{sortIndicator("seniority")}
                </th>
                <th className={`col-location${sortCol === "country" ? " sorted" : ""}`} onClick={() => handleSort("country")}>
                  Location{sortIndicator("country")}
                </th>
                <th className={`col-status${sortCol === "overall_status" ? " sorted" : ""}`} onClick={() => handleSort("overall_status")}>
                  Status{sortIndicator("overall_status")}
                </th>
                <th className={`col-emails${sortCol === "total_emails_sent" ? " sorted" : ""}`} onClick={() => handleSort("total_emails_sent")} style={{ textAlign: "right" }}>
                  Sent{sortIndicator("total_emails_sent")}
                </th>
                <th className={`col-replies${sortCol === "total_replies" ? " sorted" : ""}`} onClick={() => handleSort("total_replies")} style={{ textAlign: "right" }}>
                  Replies{sortIndicator("total_replies")}
                </th>
                <th className={`col-source${sortCol === "source_platform" ? " sorted" : ""}`} onClick={() => handleSort("source_platform")}>
                  Source{sortIndicator("source_platform")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td className="col-check"><div className="checkbox-cell"><input type="checkbox" disabled /></div></td>
                    <td><div className="skeleton" style={{ width: "70%" }} /></td>
                    <td><div className="skeleton" style={{ width: "60%" }} /></td>
                    <td><div className="skeleton" style={{ width: "50%" }} /></td>
                    <td><div className="skeleton" style={{ width: "45%" }} /></td>
                    <td><div className="skeleton" style={{ width: "40%" }} /></td>
                    <td><div className="skeleton" style={{ width: "50%" }} /></td>
                    <td><div className="skeleton" style={{ width: "55%" }} /></td>
                    <td><div className="skeleton" style={{ width: "45%" }} /></td>
                    <td style={{ textAlign: "right" }}><div className="skeleton" style={{ width: 30, marginLeft: "auto" }} /></td>
                    <td style={{ textAlign: "right" }}><div className="skeleton" style={{ width: 30, marginLeft: "auto" }} /></td>
                    <td><div className="skeleton" style={{ width: "50%" }} /></td>
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <div className="empty-state-title">No prospects found</div>
                      <div>
                        Run the platform sync worker (Railway cron on <code style={{ fontSize: 11 }}>sync</code> service) with
                        SmartLead/HeyReach keys on each client, or adjust filters.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className={selected.has(c.id) ? "selected" : ""}>
                    <td className="col-check">
                      <div className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      </div>
                    </td>
                    <td className="col-name">
                      <div className="name-cell">
                        <div className="avatar">{initials(c)}</div>
                        <div>
                          <div className="name-text">{c.full_name?.trim() || c.email}</div>
                          <div className="email-text">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="col-title">{c.title || "\u2014"}</td>
                    <td className="col-company">{c.company_name || "\u2014"}</td>
                    <td className="col-industry">{c.company_industry || "\u2014"}</td>
                    <td className="col-size">{c.company_size || "\u2014"}</td>
                    <td className="col-seniority">{c.seniority || "\u2014"}</td>
                    <td className="col-location">{location(c) || "\u2014"}</td>
                    <td className="col-status">
                      {c.overall_status ? (
                        <span className={`badge ${BADGE_CLASS[c.overall_status] || "badge-new"}`}>
                          {c.overall_status.replace(/_/g, " ")}
                        </span>
                      ) : "\u2014"}
                    </td>
                    <td className="col-emails" style={{ textAlign: "right" }}>{c.total_emails_sent}</td>
                    <td className="col-replies" style={{ textAlign: "right" }}>{c.total_replies}</td>
                    <td className="col-source">{c.source_platform || "\u2014"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info">
            {total > 0
              ? `Showing ${(page - 1) * perPage + 1}\u2013${Math.min(page * perPage, total)} of ${total.toLocaleString()}`
              : "No results"}
          </div>
          <div className="pagination-buttons">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  className={`page-btn${p === page ? " active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              );
            })}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

