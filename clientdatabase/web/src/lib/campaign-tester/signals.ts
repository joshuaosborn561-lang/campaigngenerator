/**
 * Module 3 — buying signal catalogue.
 *
 * Each signal maps to (a) the data source the user needs to have on hand and
 * (b) the Test 4 play it pairs best with. The knowledge-base Test 4 play IDs
 * (see `knowledge-base.ts::TESTS[3].variants`) are referenced here so the
 * wizard can tell the user "selecting this signal biases Test 4 toward
 * `hiring_trigger`".
 */

import { getVariant } from "./knowledge-base";

export interface SignalDefinition {
  id: string;
  label: string;
  description: string;
  pairsWithPlayId: string; // references knowledge-base.ts play IDs
  dataSource: string;
  sourcingInstructions: string;
}

export const SIGNALS: SignalDefinition[] = [
  {
    id: "hiring",
    label: "Hiring trigger",
    description: "Actively posting SDR / AE / marketing roles.",
    pairsWithPlayId: "hiring_trigger",
    dataSource: "Apollo 'Currently Hiring For' filter or LinkedIn Jobs scrape.",
    sourcingInstructions:
      "Use Apollo's 'Currently Hiring For' filter or scrape LinkedIn Jobs for the target roles at your target companies. Export with company + date-posted so you can freshness-filter.",
  },
  {
    id: "funding",
    label: "Funding trigger",
    description: "Series A–C in the last 90 days.",
    pairsWithPlayId: "competitor_mention",
    dataSource: "Crunchbase, Apollo funding filter, or a monthly TechCrunch pull.",
    sourcingInstructions:
      "Pull funding rounds from Crunchbase / Apollo in the last 90 days, filter to Series A–C, dedupe by domain, then enrich contacts at each company.",
  },
  {
    id: "technographic",
    label: "Technographic trigger",
    description: "Using a specific tool we can reference.",
    pairsWithPlayId: "tech_stack",
    dataSource: "BuiltWith or Apollo 'Technology' filter.",
    sourcingInstructions:
      "Use BuiltWith or Apollo's Technology filter for the exact tool. Export with domain + last-detected date.",
  },
  {
    id: "competitor_followers",
    label: "Competitor follower scrape",
    description: "Followers of a named competitor on LinkedIn.",
    pairsWithPlayId: "linkedin_scrape",
    dataSource: "PhantomBuster LinkedIn Company Followers scraper.",
    sourcingInstructions:
      "Point PhantomBuster's LinkedIn Company Followers scraper at competitor company pages. Cap at 2,500 profiles per run and enrich through the Apollo → Prospeo → Findymail waterfall.",
  },
  {
    id: "rb2b_web_traffic",
    label: "Website visitor intent",
    description: "Anonymous traffic on your site resolved to a company.",
    pairsWithPlayId: "web_traffic",
    dataSource: "RB2B (or Clearbit Reveal, Warmly).",
    sourcingInstructions:
      "Connect RB2B to the client's site. Filter daily-matched companies to your ICP. Route matches into SmartLead with a 24-hour SLA.",
  },
  {
    id: "linkedin_events",
    label: "LinkedIn event attendees",
    description: "Sales Nav event / community attendee scrape.",
    pairsWithPlayId: "keyword_signal",
    dataSource: "LinkedIn Sales Nav + PhantomBuster event-attendee scraper.",
    sourcingInstructions:
      "Pick an event relevant to your ICP. Run PhantomBuster's event-attendee scraper. Enrich and dedupe against prior campaigns.",
  },
  {
    id: "manual_intent",
    label: "Manual intent signal",
    description: "A specific post / comment / tweet / podcast appearance.",
    pairsWithPlayId: "manual_intent",
    dataSource: "Manual collection (operator).",
    sourcingInstructions:
      "Collect 50-200 intent artifacts by hand. Reference the specific artifact in the opening line — that is what earns the reply.",
  },
  {
    id: "no_signal",
    label: "No signal (cold database pull)",
    description: "Control variant — pure ICP match, no trigger.",
    pairsWithPlayId: "generic_pain",
    dataSource: "Apollo / AI-Ark ICP filter only.",
    sourcingInstructions:
      "Build your ICP in Apollo or AI-Ark, waterfall enrich (Apollo → Prospeo → Findymail), isolate catch-alls, normalize company names, and lowercase titles before loading into SmartLead.",
  },
];

export interface SignalWithPlayLabel extends SignalDefinition {
  pairsWithPlayLabel: string;
}

export function signalsWithPlayLabels(): SignalWithPlayLabel[] {
  return SIGNALS.map((s) => {
    const variant = getVariant(4, s.pairsWithPlayId);
    return {
      ...s,
      pairsWithPlayLabel: variant?.label ?? s.pairsWithPlayId,
    };
  });
}

export function getSignal(id: string): SignalDefinition | undefined {
  return SIGNALS.find((s) => s.id === id);
}
