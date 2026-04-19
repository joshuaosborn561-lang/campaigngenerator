/**
 * Reject anything that is not a single read-only SELECT (or WITH … SELECT).
 */

const BLOCKED =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|execute)\b/i;
const BLOCKED_SUBSTRINGS = [
  "vault.",
  "private.",
  "pgp_",
  "decrypt_api_key",
  "get_clients_for_sync",
  "set_client_api_keys",
];

export function assertReadOnlySelect(sql: string): string {
  let s = sql.trim();
  s = s.replace(/\s*;\s*$/, "");
  if (!s) throw new Error("Empty SQL");

  if (s.includes(";")) {
    throw new Error("Multiple statements are not allowed");
  }

  const lower = s.toLowerCase();
  if (!lower.startsWith("select") && !lower.startsWith("with")) {
    throw new Error("Only SELECT or WITH queries are allowed");
  }

  if (BLOCKED.test(s)) {
    throw new Error("Query contains disallowed keywords");
  }

  const lowerS = s.toLowerCase();
  for (const frag of BLOCKED_SUBSTRINGS) {
    if (lowerS.includes(frag.toLowerCase())) {
      throw new Error("Query references restricted objects");
    }
  }

  return s;
}
