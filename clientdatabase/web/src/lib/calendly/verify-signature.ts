import { createHmac, timingSafeEqual } from "crypto";

/**
 * Calendly webhook signing: header `Calendly-Webhook-Signature` is `t=<unix>,v1=<hex_hmac>`.
 * HMAC-SHA256 over the string `<t>.<rawRequestBody>` using the webhook signing key from the subscription.
 * @see https://developer.calendly.com/api-docs/ZG9jOjM2MzE2MDM4-webhook-signatures
 */
export function verifyCalendlyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  signingKey: string
): boolean {
  if (!signatureHeader || !signingKey) return false;

  let t = "";
  let v1 = "";
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "t") t = val;
    if (key === "v1") v1 = val;
  }
  if (!t || !v1) return false;

  const expected = createHmac("sha256", signingKey).update(`${t}.${rawBody}`).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
