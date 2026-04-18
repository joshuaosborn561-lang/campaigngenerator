/**
 * Infrastructure sizing math for Module 2.
 *
 * Rules (per the SalesGlider spec):
 *   - 22 working days / month
 *   - 25 sends per inbox per day
 *   - 4 inboxes per domain
 *   - 20% safety buffer on the final domain count
 *
 * All intermediate numbers are rounded UP (Math.ceil) so the user never
 * under-provisions.
 */

import type { InfraCalc } from "./brief-types";

export function calcInfrastructure(monthlyVolume: number): InfraCalc {
  const safeVol = Math.max(0, Math.floor(monthlyVolume));
  const emailsPerDay = Math.ceil(safeVol / 22);
  const inboxesNeeded = Math.ceil(emailsPerDay / 25);
  const rawDomains = inboxesNeeded / 4;
  const domainsNeeded = Math.ceil(rawDomains * 1.2);
  return {
    emails_per_day: emailsPerDay,
    inboxes_needed: inboxesNeeded,
    domains_needed: domainsNeeded,
  };
}

// ---------- Structured checklist (Module 2 step 2) ----------

export type ChecklistCategory =
  | "domains"
  | "authentication"
  | "inboxes"
  | "send_settings"
  | "monitoring";

export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  label: string;
}

export const INFRA_CHECKLIST_V2: ChecklistItem[] = [
  // Domains
  {
    id: "com_satellite_domains",
    category: "domains",
    label:
      "Purchased exact number of .com satellite domains (trybrand.com, getbrand.com — no hyphens, no numbers)",
  },
  {
    id: "google_ms_split",
    category: "domains",
    label: "50/50 split between Google Workspace and Microsoft 365 confirmed",
  },
  {
    id: "registrar_porkbun",
    category: "domains",
    label: "Domain registrar: Porkbun recommended",
  },

  // Authentication
  { id: "spf", category: "authentication", label: "SPF record configured on every domain" },
  { id: "dkim", category: "authentication", label: "DKIM record configured on every domain" },
  { id: "dmarc", category: "authentication", label: "DMARC enforcement configured on every domain" },
  {
    id: "mxtoolbox_verified",
    category: "authentication",
    label: "Verified all three using MXToolbox or similar",
  },

  // Inboxes
  { id: "max_4_per_domain", category: "inboxes", label: "Maximum 4 inboxes per domain" },
  { id: "smartlead_connected", category: "inboxes", label: "All inboxes connected to Smartlead" },
  {
    id: "warmup_enabled",
    category: "inboxes",
    label: "Warmup enabled on every inbox via Smartlead native warmup",
  },
  {
    id: "warmup_3_weeks",
    category: "inboxes",
    label: "Warmup running for minimum 3 weeks before sending",
  },

  // Send settings
  {
    id: "daily_cap_25",
    category: "send_settings",
    label: "Daily send limit set to 25 per inbox in Smartlead",
  },
  {
    id: "local_business_hours",
    category: "send_settings",
    label: "Sending window set to prospect's local business hours",
  },
  {
    id: "tracking_off",
    category: "send_settings",
    label: "Tracking links turned OFF",
  },
  {
    id: "plain_text",
    category: "send_settings",
    label: "Plain text format confirmed — no HTML, no images, no links in body",
  },

  // Monitoring
  {
    id: "placement_monitoring",
    category: "monitoring",
    label: "EmailGuard or GlockApps connected for inbox placement monitoring",
  },
];

export const CHECKLIST_CATEGORIES: { id: ChecklistCategory; label: string }[] = [
  { id: "domains", label: "Domains" },
  { id: "authentication", label: "Authentication" },
  { id: "inboxes", label: "Inboxes" },
  { id: "send_settings", label: "Send settings" },
  { id: "monitoring", label: "Monitoring" },
];

export function checklistComplete(state: Record<string, boolean> | null | undefined): boolean {
  if (!state) return false;
  return INFRA_CHECKLIST_V2.every((item) => !!state[item.id]);
}

export function checklistProgress(state: Record<string, boolean> | null | undefined): {
  done: number;
  total: number;
} {
  const total = INFRA_CHECKLIST_V2.length;
  const done = INFRA_CHECKLIST_V2.filter((i) => state?.[i.id]).length;
  return { done, total };
}
