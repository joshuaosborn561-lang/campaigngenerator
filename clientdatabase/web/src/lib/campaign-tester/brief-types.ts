/**
 * Shared types for the Campaign Testing Machine setup wizard (Modules 1-4).
 *
 * These mirror the extra columns added to `campaign_briefs` in migration 005
 * plus the `offer_conversations` chat table. The wizard pages and API routes
 * both import from here so the serialized shape stays consistent.
 */

export type ModuleKey =
  | "module_1_brief"
  | "module_2_infra"
  | "module_3_icp"
  | "module_4_offers"
  | "module_5_tests";

export type BriefProgress = Record<ModuleKey, boolean>;

export type RiskTolerance =
  | "pay_per_meeting"
  | "guarantee"
  | "free_trial"
  | "money_back"
  | "none"
  | null;

export type TargetingRole = "buyer" | "user" | null;

export type IcpDefinitionAxis = "what_they_do" | "tools" | "signals";

export interface InfraCalc {
  emails_per_day: number;
  inboxes_needed: number;
  domains_needed: number;
}

export interface IcpRefinement {
  targeting_role?: TargetingRole;
  icp_definition_by?: IcpDefinitionAxis[];
  bad_fit_profile?: string | null;
  min_company_size?: number | null;
  primary_titles?: string[];
  secondary_titles?: string[];
  exclusions?: string[];
}

export interface ApolloFilters {
  job_titles?: string[];
  industries?: string[];
  employee_count?: string;
  geography?: string[];
  keywords?: string[];
  exclude?: string[];
  signals_to_layer?: string[];
  sourcing_instructions?: Record<string, string>;
  tam_estimate?: string;
}

export interface Offer {
  id: string;
  rank: number;
  name: string;
  one_liner: string;
  cta: string;
  rationale?: string;
  approved: boolean;
  generated_at?: string;
}

/**
 * Full brief shape as the wizard reads it off the API. Unspecified fields are
 * treated as null/undefined — renderers must handle partial hydration.
 */
export interface BriefRecord {
  id: string;
  client_id: string | null;
  name: string;

  // Module 1 — core brief
  what_they_do: string | null;
  measurable_outcome: string | null;
  timeline_claim: string | null;
  named_results: string | null;
  risk_tolerance: RiskTolerance;
  core_pain: string | null;
  offer_description: string | null;
  offer_type_hint: string | null;

  // Legacy ICP fields (still used as headline ICP; Module 3 refines further)
  icp_job_title: string | null;
  icp_company_size: string | null;
  icp_geography: string | null;
  target_industry: string | null;

  // Module 2
  monthly_email_volume: number | null;
  infra_calc: Partial<InfraCalc> | null;
  infrastructure_status: Record<string, boolean> | null;

  // Module 3
  icp_refinement: IcpRefinement | null;
  signals_selected: string[] | null;
  apollo_filters: ApolloFilters | null;

  // Module 4
  offer_pool: Offer[] | null;

  /** Campaign Strategy Engine (JSONB): client_profile, objection_map, campaign_ideas, offer_scores, copy_qa */
  campaign_strategy_engine?: Record<string, unknown> | null;

  // Other
  available_assets: Record<string, boolean> | null;
  available_plays: string[] | null;
  progress: BriefProgress;
  status: "in_progress" | "complete" | "abandoned";
  created_at: string;
  updated_at: string;

  clients?: {
    id: string;
    name: string;
    industry_vertical: string | null;
  } | null;
}

export interface OfferConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  offer_snapshot?: Offer[];
  created_at: string;
}

export interface OfferConversationRecord {
  id: string;
  brief_id: string;
  messages: OfferConversationMessage[];
  created_at: string;
  updated_at: string;
}

// ---------- Progress helpers ----------

export const MODULE_ORDER: ModuleKey[] = [
  "module_1_brief",
  "module_2_infra",
  "module_3_icp",
  "module_4_offers",
  "module_5_tests",
];

export function moduleLocked(progress: BriefProgress | null, m: ModuleKey): boolean {
  if (!progress) return m !== "module_1_brief";
  const idx = MODULE_ORDER.indexOf(m);
  if (idx <= 0) return false;
  const prev = MODULE_ORDER[idx - 1];
  return !progress[prev];
}

export function emptyProgress(): BriefProgress {
  return {
    module_1_brief: false,
    module_2_infra: false,
    module_3_icp: false,
    module_4_offers: false,
    module_5_tests: false,
  };
}

export function approvedOffers(pool: Offer[] | null | undefined): Offer[] {
  return (pool ?? []).filter((o) => o.approved);
}
