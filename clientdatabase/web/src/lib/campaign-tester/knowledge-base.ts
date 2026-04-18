/**
 * Cold Email Campaign Testing Machine — knowledge base.
 *
 * These are the ONLY options the wizard is allowed to surface. Copy
 * generation must never invent a new option; Claude is instructed to
 * stick to the entries defined here.
 *
 * Structure:
 *   - Test 1: infrastructure checklist (pass/fail gate, no variants)
 *   - Tests 2-6: variable tested + variants + success metric
 */

export interface TestVariant {
  id: string;
  label: string;
  description: string;
  // Optional extra guidance the copy-generation prompt should honor.
  // e.g. "body must open with a pain point" for offer_framing=pain-first.
  generationGuidance?: string;
}

export interface TestDefinition {
  number: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  variableTested: string;
  summary: string;
  explanation: string;
  variants: TestVariant[];
  successMetric: string;
  // Additional sub-variables for tests that actually test multiple things at
  // once (Test 3 has tier + size + signal + vertical + geography; Test 5 has
  // CTA + body structure + PS line).
  subVariables?: {
    id: string;
    label: string;
    options: TestVariant[];
  }[];
}

// ---------- Test 1: Infrastructure & Data Integrity ----------

export interface InfrastructureChecklistItem {
  id: string;
  label: string;
  category: "deliverability" | "list_hygiene" | "volume";
}

export const INFRASTRUCTURE_CHECKLIST: InfrastructureChecklistItem[] = [
  { id: "com_domains", label: ".com satellite domains only", category: "deliverability" },
  { id: "inbox_count", label: "2-3 inboxes per domain", category: "deliverability" },
  { id: "google_ms_split", label: "50/50 Google / Microsoft split", category: "deliverability" },
  { id: "dns_verified", label: "SPF / DKIM / DMARC verified", category: "deliverability" },
  { id: "warmup_complete", label: "3-4 weeks warmup minimum", category: "deliverability" },
  { id: "send_cap", label: "≤ 50 emails/day per inbox", category: "volume" },
  { id: "plain_text", label: "Plain text format (no HTML/images)", category: "deliverability" },
  { id: "no_tracking", label: "Tracking links off", category: "deliverability" },
  { id: "no_body_links", label: "No links in body", category: "deliverability" },
  { id: "verified_list", label: "Full list verified via MillionVerifier", category: "list_hygiene" },
  { id: "catchalls_isolated", label: "Catch-alls isolated into their own segment", category: "list_hygiene" },
  { id: "company_names_normalized", label: "Company names normalized", category: "list_hygiene" },
  { id: "titles_lowercased", label: "Job titles lowercased", category: "list_hygiene" },
  { id: "b2b_filter", label: "B2B/B2C filter applied", category: "list_hygiene" },
  { id: "list_fresh", label: "List < 90 days old", category: "list_hygiene" },
  { id: "enough_contacts", label: "300+ verified contacts per variant ready", category: "volume" },
];

// ---------- Tests 2-6: definitions ----------

export const TESTS: TestDefinition[] = [
  // ---- Test 1 (infrastructure) -------------------------------------
  {
    number: 1,
    name: "Infrastructure & Data Integrity",
    variableTested: "infrastructure",
    summary: "Pass/fail gate before any testing begins.",
    explanation:
      "Before spending a single email on testing offer or copy, infrastructure has to be right. If open rate is below 40% or bounce rate above 1.5%, copy tests are meaningless — you'd be measuring your DNS, not your message. This is a checklist, not a selection.",
    variants: [],
    successMetric: "open_rate > 40% AND bounce_rate < 1.5%",
  },

  // ---- Test 2 (offer) ---------------------------------------------
  {
    number: 2,
    name: "The Offer",
    variableTested: "offer_type",
    summary:
      "The offer is the highest-leverage variable. Test it before everything except infrastructure.",
    explanation:
      "A mediocre offer with a great play will outperform a great offer with no play — and the right offer can lift positive reply rates by 3-5x. Most campaigns die here, not at copy.",
    variants: [
      {
        id: "audit",
        label: "The Audit",
        description:
          "3-minute Loom or written evaluation of something specific (their ads, their careers page, their funnel).",
        generationGuidance:
          "Offer a specific, scoped evaluation. Make the work feel free and small. Name the specific deliverable (Loom vs. doc vs. slide).",
      },
      {
        id: "data_asset",
        label: "The Data Asset",
        description:
          "Free lead list, benchmark report, or pre-built deliverable relevant to their function.",
        generationGuidance:
          "Lead with the asset and its value. The CTA is 'want me to send it?' not a meeting.",
      },
      {
        id: "performance_play",
        label: "The Performance Play",
        description:
          "Pay-per-meeting, results guarantee, or rev-share. Inverts risk.",
        generationGuidance:
          "Name the risk reversal in the first 2 lines. This offer lives or dies on the credibility of the guarantee.",
      },
      {
        id: "strategy_session",
        label: "The Strategy Session",
        description: "15-min growth mapping or playbook walk-through call.",
        generationGuidance:
          "Be clear the call is a session, not a sales pitch. Name what they walk away with.",
      },
      {
        id: "shock_and_awe",
        label: "Shock & Awe",
        description:
          "Physical gift or high-effort custom deliverable. Only for high-LTV targets.",
        generationGuidance:
          "Tease the gift, don't describe it. Reply-bait CTA works best here ('want me to send it?').",
      },
    ],
    successMetric: "positive_reply_rate > 1%",
  },

  // ---- Test 3 (persona & segmentation) ----------------------------
  {
    number: 3,
    name: "Persona & Niche Segmentation",
    variableTested: "segmentation",
    summary:
      "Who gets the email. Title tier × company size × buying signal × vertical × geography.",
    explanation:
      "The same offer lands very differently on a 15-person agency vs a 200-person series B. Segment by the axis most likely to shift response for your offer.",
    variants: [],
    subVariables: [
      {
        id: "title_tier",
        label: "Title tier",
        options: [
          { id: "ceo_founder", label: "CEO / Founder", description: "Top of the org. Best for SMB offers, worst for enterprise." },
          { id: "vp_director", label: "VP / Director", description: "Budget holder in mid-market. Often the real decision-maker." },
          { id: "manager", label: "Manager", description: "Owns the workflow. Good for tool-level offers, bad for strategic ones." },
        ],
      },
      {
        id: "company_size",
        label: "Company size",
        options: [
          { id: "1_10", label: "1-10 employees", description: "Founder-led, moves fast, small budget." },
          { id: "11_50", label: "11-50 employees", description: "First sales hires, structured buying starting." },
          { id: "51_200", label: "51-200 employees", description: "Real budget, real process, longer cycles." },
          { id: "200_500", label: "200-500 employees", description: "Procurement involved. Best with named-account plays." },
        ],
      },
      {
        id: "buying_signal",
        label: "Buying signal",
        options: [
          { id: "hiring_signal", label: "Hiring SDRs/AEs", description: "They're scaling outbound — your offer is adjacent." },
          { id: "funding_signal", label: "Recently funded (Series A-C)", description: "Fresh capital, growth pressure." },
          { id: "no_signal", label: "No signal (control)", description: "Baseline against which you measure the signal lift." },
        ],
      },
      {
        id: "geography",
        label: "Geography",
        options: [
          { id: "local_regional", label: "Local / regional", description: "Enables local-play angle, better reply rates if relevant." },
          { id: "national", label: "National", description: "Biggest volume, weakest personalization handle." },
        ],
      },
    ],
    successMetric: "positive_reply_rate highest across segments; replies from decision-makers vs gatekeepers",
  },

  // ---- Test 4 (play & angle) --------------------------------------
  {
    number: 4,
    name: "The Play & Angle",
    variableTested: "play_used",
    summary: "How you earn the right to the first line. The personalization vector.",
    explanation:
      "The play is the reason the prospect doesn't delete at first glance. 'How did you know that?' in a reply is the signal that the play is landing.",
    variants: [
      { id: "name_drop", label: "Colleague name-drop", description: "Reference a mutual connection or named teammate." },
      { id: "icp_identification", label: "ICP identification", description: "Call out specifically what kind of company they are." },
      { id: "competitor_mention", label: "Competitor mention", description: "Reference a competitor you've worked with." },
      { id: "linkedin_scrape", label: "LinkedIn follower scrape", description: "Target recent followers of a specific account." },
      { id: "hiring_trigger", label: "Hiring trigger", description: "They posted an SDR/AE role — lead with that." },
      { id: "tech_stack", label: "Tech stack signal", description: "BuiltWith / similarweb data — reference their stack." },
      { id: "local_play", label: "Local play", description: "Same city / region / industry cluster." },
      { id: "keyword_signal", label: "Keyword / community signal", description: "Active in a Slack / Discord / podcast / subreddit." },
      { id: "manual_intent", label: "Manual intent signal", description: "You saw a post / comment / action — reference it." },
      { id: "web_traffic", label: "Web traffic play", description: "They visited your site — outreach based on that." },
      { id: "colleague_personalization", label: "Colleague personalization", description: "Reference something about someone on their team." },
      { id: "generic_pain", label: "Generic pain opener (control)", description: "No personalization — baseline against which all other plays are measured." },
    ],
    successMetric: "positive_reply_rate highest; bonus signal = replies containing 'how did you know that?'",
  },

  // ---- Test 5 (CTA & copy structure) ------------------------------
  {
    number: 5,
    name: "CTA Friction & Copy Structure",
    variableTested: "cta_and_structure",
    summary: "How you ask, how you structure, and what's after 'P.S.'",
    explanation:
      "Small structural changes compound: moving from a direct ask to a soft ask can double reply rate without touching the offer.",
    variants: [],
    subVariables: [
      {
        id: "cta_type",
        label: "CTA type",
        options: [
          { id: "soft_interest", label: "Soft / interest-based", description: "'Worth a look?' / 'Interested?'" },
          { id: "question", label: "Question-based", description: "End on a question that invites a short answer." },
          { id: "asset_based", label: "Asset-based", description: "'Want me to send it?'" },
          { id: "direct_ask", label: "Direct ask", description: "'15 min Thursday?'" },
          { id: "reply_bait", label: "Reply-bait (no explicit CTA)", description: "End mid-thought, letting curiosity pull the reply." },
        ],
      },
      {
        id: "body_structure",
        label: "Body structure",
        options: [
          { id: "pain_first", label: "Pain-first → offer second", description: "Name the problem, then offer solution." },
          { id: "offer_first", label: "Offer-first → pain as context", description: "Lead with what you have, explain why after." },
          { id: "result_first", label: "Result/proof first → offer as conclusion", description: "Open with a number or case study." },
          { id: "question_first", label: "Question-first → offer as answer", description: "Open with a question the offer answers." },
        ],
      },
      {
        id: "ps_line",
        label: "P.S. line",
        options: [
          { id: "none", label: "None", description: "No P.S." },
          { id: "social_proof", label: "Social proof", description: "Named client or case study number." },
          { id: "asset_offer", label: "Asset offer", description: "'P.S. I made a list you might want too.'" },
          { id: "urgency", label: "Urgency", description: "Time-bound hook." },
        ],
      },
    ],
    successMetric: "positive_reply_rate + (meetings_booked / positive_replies) > 50%",
  },

  // ---- Test 6 (sequence structure) --------------------------------
  {
    number: 6,
    name: "Sequence Structure & Multichannel",
    variableTested: "sequence_length",
    summary: "How many touches, what channels, what angle per follow-up.",
    explanation:
      "The north-star number is meetings booked per 500 emails sent. A 5-email sequence with the right follow-up angles routinely 2-3x's what a single-send lift can do.",
    variants: [
      { id: "three_email", label: "3-email lean sequence", description: "Initial + 2 follow-ups. Best when offer is tight and ICP is small." },
      { id: "five_email", label: "5-email full sequence (Alex Berman baseline)", description: "Initial + 4 follow-ups with varied angles." },
      { id: "multichannel", label: "Email + LinkedIn multichannel", description: "Profile view D1, connection D5, direct dial D10 between email touches." },
    ],
    subVariables: [
      {
        id: "followup_angle",
        label: "Follow-up angle per touch",
        options: [
          { id: "bump", label: "Simple bump", description: "'Did this get buried?'" },
          { id: "new_data", label: "New data point", description: "New stat or piece of context." },
          { id: "new_case", label: "New case study", description: "Different named client or result." },
          { id: "new_pain", label: "Different pain point", description: "Reframe around a different problem." },
          { id: "new_offer", label: "Different offer", description: "Swap the CTA entirely." },
          { id: "role_redirect", label: "Role redirect", description: "'Not you? Who should I talk to?'" },
          { id: "breakup", label: "Breakup as permission", description: "Give them an out — often triggers a reply." },
        ],
      },
    ],
    successMetric: "meetings_per_500 (meetings booked per 500 emails sent) — the golden metric",
  },
];

// ---------- Diagnostic decision table ----------

export interface DiagnosticRule {
  id: string;
  symptomCheck: (m: {
    open_rate?: number | null;
    reply_rate?: number | null;
    positive_reply_rate?: number | null;
    meetings_booked?: number | null;
    emails_sent?: number | null;
  }) => boolean;
  symptom: string;
  probableCause: string;
  action: string;
  severity: "block" | "warn" | "info";
}

export const DIAGNOSTIC_RULES: DiagnosticRule[] = [
  {
    id: "low_opens",
    symptomCheck: (m) => (m.open_rate ?? 1) < 0.3,
    symptom: "Open rate < 30%",
    probableCause: "Deliverability",
    action: "Fix DNS, DMARC, warmup before proceeding.",
    severity: "block",
  },
  {
    id: "low_replies",
    symptomCheck: (m) => (m.reply_rate ?? 1) < 0.005,
    symptom: "Reply rate < 0.5%",
    probableCause: "Wrong ICP or irrelevant offer",
    action: "Return to Test 2 or 3.",
    severity: "block",
  },
  {
    id: "low_positive_ratio",
    symptomCheck: (m) => {
      if (!m.reply_rate || !m.positive_reply_rate) return false;
      if (m.reply_rate < 0.01) return false; // only fires when there are replies at all
      return m.positive_reply_rate / m.reply_rate < 0.3;
    },
    symptom: "High replies, low positive ratio",
    probableCause: "Weak offer or bait-and-switch",
    action: "Reframe offer, add risk reversal.",
    severity: "warn",
  },
  {
    id: "replies_no_bookings",
    symptomCheck: (m) => {
      if (!m.positive_reply_rate || m.positive_reply_rate < 0.005) return false;
      if (!m.meetings_booked || !m.emails_sent) return false;
      const meetingsPerPositive =
        m.meetings_booked / (m.positive_reply_rate * m.emails_sent);
      return meetingsPerPositive < 0.5;
    },
    symptom: "High positive replies, low bookings",
    probableCause: "CTA friction or slow follow-up",
    action: "Test softer CTA.",
    severity: "warn",
  },
  {
    id: "huge_emails_per_booking",
    symptomCheck: (m) => {
      if (!m.emails_sent || !m.meetings_booked) return false;
      return m.emails_sent / m.meetings_booked > 5000;
    },
    symptom: "5,000+ emails per booking",
    probableCause: "Fundamental list or offer problem",
    action: "Do not test copy — fix big levers first.",
    severity: "block",
  },
];

// ---------- Small helpers ----------

export function getTest(n: number): TestDefinition | null {
  return TESTS.find((t) => t.number === n) ?? null;
}

export function getVariant(testNumber: number, variantId: string): TestVariant | null {
  const test = getTest(testNumber);
  if (!test) return null;
  const inMain = test.variants.find((v) => v.id === variantId);
  if (inMain) return inMain;
  for (const sub of test.subVariables ?? []) {
    const match = sub.options.find((v) => v.id === variantId);
    if (match) return match;
  }
  return null;
}
