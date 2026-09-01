export function jsonResponse(status, body, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return { status, headers, body };
}

export function corsHeaders(origin) {
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function isAllowedOrigin(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes("*") || allowed.includes(origin);
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMonthsIso(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}

export function ageAt(dobString, at = new Date()) {
  const dob = parseDate(dobString);
  if (!dob) return null;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < dob.getUTCMonth() ||
    (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function parseDate(value) {
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    return new Date(String(value).length > 10 ? n : n * 1000);
  }
  if (typeof value !== "string") return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DOB_KEYS = /^(date[_-]?of[_-]?birth|dob)$/i;

export function findDateOfBirth(session) {
  const direct =
    deepGet(session, ["resources", "id_documents"]) ||
    deepGet(session, ["session", "resources", "id_documents"]);
  if (Array.isArray(direct)) {
    for (const doc of direct) {
      const fields = doc.fields || {};
      const hit = firstDobValue(fields) || firstDobValue(doc.document_fields || {});
      if (hit) return hit;
    }
  }
  for (const check of session.checks || []) {
    const report = check.report || {};
    const hit =
      firstDobValue(report.documentFields || {}) ||
      firstDobValue(report.document_fields || {}) ||
      firstDobValue(report);
    if (hit) return hit;
  }
  const found = deepFindDob(session);
  return found;
}

function firstDobValue(obj) {
  for (const key of Object.keys(obj)) {
    if (DOB_KEYS.test(key) && typeof obj[key] !== "object") {
      return String(obj[key]);
    }
  }
  return null;
}

function deepFindDob(node, depth = 0) {
  if (depth > 8 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = deepFindDob(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (DOB_KEYS.test(key) && typeof value !== "object" && parseDate(String(value))) {
      return String(value);
    }
    if (typeof value === "object") {
      const hit = deepFindDob(value, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function deepGet(obj, keys) {
  let cur = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

export function extractSessionId(body) {
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body.session_id,
    body.sessionId,
    deepGet(body, ["data", "session_id"]),
    deepGet(body, ["data", "sessionId"]),
    deepGet(body, ["session", "id"]),
    deepGet(body, ["session", "session_id"]),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

export function clientIp(headers) {
  const fwd = headers["x-forwarded-for"] || "";
  const first = fwd.split(",")[0].trim();
  if (first) return first;
  return headers["x-real-ip"] || "unknown";
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
