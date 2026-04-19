/**
 * Reject anything that is not a single read-only SELECT (or WITH … SELECT).
 */

const BLOCKED = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|execute)\b/i;

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

  return s;
}
