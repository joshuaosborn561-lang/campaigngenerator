/**
 * Best-effort extraction from Calendly webhook JSON (invitee.* events).
 * Shapes vary slightly by API version; unknown events return null handled by caller.
 */

export type ParsedCalendlyInvitee = {
  eventName: string;
  inviteeUri: string;
  eventUri: string | null;
  inviteeEmail: string;
  inviteeName: string | null;
  status: "active" | "canceled";
  eventStartAt: string | null;
  eventEndAt: string | null;
  canceledAt: string | null;
  eventType: string | null;
  /** Calendly org URI from payload — key for "your account vs theirs". */
  organizationUri: string | null;
  /** Calendly user URI when present — alternate map key. */
  userUri: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Walk common Calendly webhook shapes to find the invitee object. */
export function extractInviteeFromWebhook(body: unknown): ParsedCalendlyInvitee | null {
  const root = asRecord(body);
  if (!root) return null;

  const payload = asRecord(root.payload) ?? root;
  const invitee = asRecord(payload.invitee);
  if (!invitee) return null;

  const email =
    pickString(invitee, "email") ??
    pickString(asRecord(invitee.email), "value") ??
    null;
  if (!email) return null;

  const inviteeUri =
    pickString(invitee, "uri") ?? pickString(invitee, "invitee_uri") ?? pickString(invitee, "resource_uri");
  if (!inviteeUri) return null;

  const scheduled = asRecord(invitee.scheduled_event) ?? asRecord(payload.scheduled_event);
  const eventUri =
    pickString(scheduled, "uri") ??
    pickString(invitee, "event") ??
    pickString(payload, "event") ??
    null;

  const statusRaw = (pickString(invitee, "status") ?? "active").toLowerCase();
  const status: "active" | "canceled" = statusRaw === "canceled" ? "canceled" : "active";

  const start =
    pickString(scheduled, "start_time") ?? pickString(payload, "start_time") ?? pickString(root, "start_time") ?? null;
  const end = pickString(scheduled, "end_time") ?? pickString(payload, "end_time") ?? null;

  const canceledAt =
    status === "canceled"
      ? pickString(invitee, "canceled_at") ?? pickString(payload, "canceled_at") ?? new Date().toISOString()
      : null;

  const nameParts = [pickString(invitee, "first_name"), pickString(invitee, "last_name")].filter(Boolean);
  const name =
    pickString(invitee, "name") ?? (nameParts.length ? nameParts.join(" ") : null);

  const eventName =
    pickString(scheduled, "name") ?? pickString(payload, "name") ?? pickString(root, "name") ?? "Calendly event";

  const eventType =
    pickString(payload, "event_type") ?? pickString(root, "event") ?? pickString(payload, "event");

  const organizationUri =
    pickString(payload, "organization") ??
    pickString(root, "organization") ??
    pickString(scheduled, "organization") ??
    null;

  const userUri =
    pickString(payload, "user") ??
    pickString(root, "user") ??
    pickString(scheduled, "created_by") ??
    pickString(payload, "created_by") ??
    null;

  return {
    eventName,
    inviteeUri,
    eventUri,
    inviteeEmail: email.trim().toLowerCase(),
    inviteeName: name,
    status,
    eventStartAt: start,
    eventEndAt: end,
    canceledAt,
    eventType,
    organizationUri,
    userUri,
  };
}
