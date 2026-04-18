"use client";

import Link from "next/link";

const ICON_CONTACTS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ICON_IMPORT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ICON_CHAT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ICON_TESTER = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2v7.31" />
    <path d="M14 9.3V2" />
    <path d="M8.5 2h7" />
    <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
    <path d="M5.5 16h13" />
  </svg>
);

const ICON_HOME = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ICON_CLIENTS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export type SidebarActive =
  | "home"
  | "clients"
  | "contacts"
  | "import"
  | "chat"
  | "tester";

export default function AppSidebar({ active }: { active: SidebarActive }) {
  return (
    <nav className="sidebar-nav">
      <Link
        href="/"
        className={`sidebar-nav-item${active === "home" ? " active" : ""}`}
        title="Home"
      >
        {ICON_HOME}
      </Link>
      <Link
        href="/clients"
        className={`sidebar-nav-item${active === "clients" ? " active" : ""}`}
        title="Clients"
      >
        {ICON_CLIENTS}
      </Link>
      <Link
        href="/contacts"
        className={`sidebar-nav-item${active === "contacts" ? " active" : ""}`}
        title="Contacts"
      >
        {ICON_CONTACTS}
      </Link>
      <Link
        href="/import"
        className={`sidebar-nav-item${active === "import" ? " active" : ""}`}
        title="Apollo CSV Diff"
      >
        {ICON_IMPORT}
      </Link>
      <Link
        href="/chat"
        className={`sidebar-nav-item${active === "chat" ? " active" : ""}`}
        title="AI Analyst"
      >
        {ICON_CHAT}
      </Link>
      <Link
        href="/campaign-tester"
        className={`sidebar-nav-item${active === "tester" ? " active" : ""}`}
        title="Campaign Tester"
      >
        {ICON_TESTER}
      </Link>
    </nav>
  );
}
