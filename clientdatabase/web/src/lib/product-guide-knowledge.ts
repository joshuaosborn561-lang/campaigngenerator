/**
 * Static knowledge for the guide chat (RAG-style grounding). Keep in sync with README / product behavior.
 */
export const PRODUCT_GUIDE_KNOWLEDGE = `
# Agency Intelligence Platform — Operator Guide

## What this is
A central warehouse (Supabase) for SmartLead + HeyReach campaign data, with:
- **Clients**: each row stores API keys and vertical; nightly sync pulls that client's campaigns into shared tables.
- **Contacts**: deduplicated people with lead-database-style filters, CSV export.
- **AI Analyst** (/chat): one place for **Ask** (Gemini on warehouse data) and **Search** (prospect table + filters + NL→filters from SmartLead/HeyReach). The /contacts and /intelligence routes redirect into /chat.
- **Campaign tester**: wizard from brief → ICP → infrastructure → offers → six structured copy tests.
- **Calendly webhooks** (/api/webhooks/calendly): verified meetings in \`calendly_events\`; use CALENDLY_ACCOUNT_MAP for agency vs client orgs.

## Clients (/clients, /clients/new)
- Create a client with name, industry vertical, and API keys.
- Client hub shows migration reminders and webhook URL hints for Calendly.
- Keys are used by sync to pull only that client's data.

## Contacts (/contacts)
- Filter sidebar: title, seniority, company, industry, status, etc.
- AI bar can translate natural language into filters.
- Export selected or filtered rows to CSV.

## AI Analyst (/chat)
- Data-grounded answers using Gemini + Supabase tools (not generic marketing advice).
- Ask about reply rates, subject lines, industries, Calendly-verified meetings, etc.

## Client strategy + campaign ideas (/campaign-tester/strategy)
- **Website analysis** (Gemini): bulk extract from the homepage; proposes ICP lanes and proof.
- **15–25 campaign ideas per lane** (Claude Sonnet): creative / strategic list; then spawn briefs from lane + offer + optional idea.

## Campaign tester (flow)
1. **New brief** (/campaign-tester/new): pick client + campaign name → creates brief row.
2. **Module 1 — Brief** (/setup/brief): positioning, audience, pain, offer direction.
3. **Module 2 — ICP** (/setup/icp): ideal customer profile.
4. **Module 3 — Infrastructure** (/setup/infrastructure): sending volume, domains, tooling.
5. **Module 4 — Offers** (/setup/offers): offer angles; may use Claude + historical pack.
6. **Tests** (/test/[n]): six copy test cells with scoring.
7. **Diagnostic** optional: deeper checks.

Uses **ANTHROPIC_API_KEY** for Claude (creative: campaign ideation, offer/copy in campaign tester). Uses **GEMINI_API_KEY** for bulk/structured work (website extract, SQL analyst, filters).

## Troubleshooting
- Empty contacts: run sync; confirm client keys and client_id linkage.
- Campaign tester errors: check ANTHROPIC_API_KEY and Supabase connectivity.
- Calendly events empty: verify webhook URL, signing secret(s), CALENDLY_ACCOUNT_MAP URIs match payload.
`;
