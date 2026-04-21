/**
 * Derive filterable engagement flags from platform category / status / sentiment.
 * SmartLead and similar tools use varying strings — match case-insensitively.
 */

const REPLY_CATEGORIES = new Set([
  "interested",
  "meeting_booked",
  "not_interested",
  "do_not_contact",
  "out_of_office",
  "wrong_person",
  "auto_reply",
  "referral",
  "closed",
  "replied",
  "positive_reply",
  "neutral_reply",
]);

const HOSTILE_CATEGORIES = new Set(["not_interested", "do_not_contact"]);

export function computeLeadEngagementFlags(input: {
  category?: string | null;
  lead_status?: string | null;
  reply_sentiment?: string | null;
}): { has_replied: boolean; is_unsubscribed: boolean; is_hostile: boolean } {
  const cat = (input.category || "").toLowerCase().replace(/\s+/g, "_");
  const st = (input.lead_status || "").toLowerCase();
  const sent = (input.reply_sentiment || "").toLowerCase();

  const has_replied =
    (cat !== "" && REPLY_CATEGORIES.has(cat)) ||
    /\brepl|inbound|responded/.test(st) ||
    (sent === "positive" || sent === "negative");

  const is_unsubscribed =
    cat === "unsubscribed" ||
    cat.includes("unsub") ||
    /\bunsub|opt\s*out|opt-out\b/.test(st);

  const is_hostile =
    HOSTILE_CATEGORIES.has(cat) ||
    sent === "negative" ||
    /\bspam|block|hostile\b/.test(st);

  return { has_replied, is_unsubscribed, is_hostile };
}
