/**
 * When one Calendly account books both your agency and your clients,
 * use env lists to mark "agency" meetings vs warehouse-attributed client meetings.
 */

function parseList(env: string | undefined): string[] {
  return (env ?? "")
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Exact invitee emails that should always count as agency (your calendar, internal). */
export function isAgencyInviteeEmail(email: string): boolean {
  const norm = email.trim().toLowerCase();
  const exact = parseList(process.env.CALENDLY_AGENCY_INVITEE_EMAILS);
  if (exact.includes(norm)) return true;

  const at = norm.lastIndexOf("@");
  if (at < 1) return false;
  const domain = norm.slice(at + 1);
  const domains = parseList(process.env.CALENDLY_AGENCY_EMAIL_DOMAINS);
  for (const d of domains) {
    const dom = d.replace(/^@/, "");
    if (domain === dom || domain.endsWith(`.${dom}`)) return true;
  }
  return false;
}
