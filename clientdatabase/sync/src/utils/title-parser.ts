/**
 * Parses a job title into seniority level and department.
 * Mimics Apollo's classification system.
 */

const SENIORITY_PATTERNS: [RegExp, string][] = [
  [/\b(ceo|cto|cfo|coo|cmo|cio|ciso|founder|co-founder|owner|partner|president)\b/i, "c-suite"],
  [/\b(vp|vice president|svp|evp|avp)\b/i, "vp"],
  [/\b(director|head of)\b/i, "director"],
  [/\b(manager|lead|team lead|supervisor)\b/i, "manager"],
  [/\b(senior|sr\.?|principal|staff)\b/i, "senior"],
  [/\b(junior|jr\.?|associate|intern|entry|assistant)\b/i, "entry"],
];

const DEPARTMENT_PATTERNS: [RegExp, string][] = [
  [/\b(sales|account executive|sdr|bdr|business development|revenue)\b/i, "sales"],
  [/\b(market|growth|demand gen|brand|content|seo|advertising|pr |public relations)\b/i, "marketing"],
  [/\b(engineer|developer|software|devops|sre|backend|frontend|fullstack|architect|programming)\b/i, "engineering"],
  [/\b(it |information technology|sysadmin|system|network|infrastructure|helpdesk|tech support)\b/i, "it"],
  [/\b(operations|ops|logistics|supply chain|procurement)\b/i, "operations"],
  [/\b(hr|human resources|people|talent|recruiting|recruiter)\b/i, "hr"],
  [/\b(finance|accounting|controller|treasurer|financial|bookkeep)\b/i, "finance"],
  [/\b(legal|counsel|compliance|attorney|lawyer)\b/i, "legal"],
  [/\b(product|pm |product manager|product owner)\b/i, "product"],
  [/\b(design|ux|ui|creative|graphic)\b/i, "design"],
  [/\b(customer success|cs |support|client|customer experience)\b/i, "customer_success"],
  [/\b(ceo|cto|cfo|coo|cmo|founder|president|owner|managing director|general manager)\b/i, "executive"],
  [/\b(security|cyber|infosec|ciso)\b/i, "security"],
];

export function parseSeniority(title: string | undefined | null): string | undefined {
  if (!title) return undefined;
  for (const [pattern, seniority] of SENIORITY_PATTERNS) {
    if (pattern.test(title)) return seniority;
  }
  return undefined;
}

export function parseDepartment(title: string | undefined | null): string | undefined {
  if (!title) return undefined;
  for (const [pattern, department] of DEPARTMENT_PATTERNS) {
    if (pattern.test(title)) return department;
  }
  return undefined;
}

/**
 * Normalize company size to Apollo-style brackets.
 */
export function normalizeCompanySize(size: string | undefined | null): string | undefined {
  if (!size) return undefined;

  // If already in bracket format, return as-is
  if (/^\d+-\d+$/.test(size) || /^\d+\+$/.test(size)) return size;

  const num = parseInt(size.replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return size;

  if (num <= 10) return "1-10";
  if (num <= 50) return "11-50";
  if (num <= 200) return "51-200";
  if (num <= 500) return "201-500";
  if (num <= 1000) return "501-1000";
  if (num <= 5000) return "1001-5000";
  return "5000+";
}

/**
 * Extract location parts from a location string like "San Francisco, CA, USA"
 */
export function parseLocation(location: string | undefined | null): {
  city?: string;
  state?: string;
  country?: string;
} {
  if (!location) return {};
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    return { city: parts[0], state: parts[1], country: parts[2] };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1] };
  }
  if (parts.length === 1) {
    return { city: parts[0] };
  }
  return {};
}
