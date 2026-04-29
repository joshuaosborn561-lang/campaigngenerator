import type { BriefRecord } from "@/lib/campaign-tester/brief-types";

export function buildBriefContextBlock(brief: BriefRecord): string {
  const lines: string[] = ["CAMPAIGN BRIEF CONTEXT"];
  lines.push(`Campaign name: ${brief.name}`);
  if (brief.clients?.name) lines.push(`Client: ${brief.clients.name}`);
  if (brief.clients?.industry_vertical) lines.push(`Client industry: ${brief.clients.industry_vertical}`);
  if (brief.what_they_do) lines.push(`What they do: ${brief.what_they_do}`);
  if (brief.measurable_outcome) lines.push(`Measurable outcome: ${brief.measurable_outcome}`);
  if (brief.core_pain) lines.push(`Core pain: ${brief.core_pain}`);
  if (brief.offer_description) lines.push(`Offer hint: ${brief.offer_description}`);
  if (brief.icp_job_title) lines.push(`ICP titles (headline): ${brief.icp_job_title}`);
  if (brief.icp_company_size) lines.push(`ICP company size: ${brief.icp_company_size}`);
  if (brief.icp_geography) lines.push(`ICP geography: ${brief.icp_geography}`);
  if (brief.target_industry) lines.push(`Target industry: ${brief.target_industry}`);
  if (brief.icp_refinement) {
    const r = brief.icp_refinement;
    if (r.primary_titles?.length) lines.push(`Primary titles: ${r.primary_titles.join(", ")}`);
    if (r.secondary_titles?.length) lines.push(`Secondary titles: ${r.secondary_titles.join(", ")}`);
    if (r.exclusions?.length) lines.push(`Exclusions: ${r.exclusions.join(", ")}`);
    if (r.bad_fit_profile) lines.push(`Bad fit: ${r.bad_fit_profile}`);
  }
  if (brief.signals_selected?.length) {
    lines.push(`Signals: ${brief.signals_selected.join(", ")}`);
  }
  return lines.join("\n");
}
