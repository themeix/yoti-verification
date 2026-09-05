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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

export function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
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

const PUBLIC_STATUS_MAP = {
  APPLICATION_CREATED: "VERIFICATION_IN_PROGRESS",
  VERIFICATION_STARTED: "VERIFICATION_IN_PROGRESS",
  VERIFICATION_IN_PROGRESS: "VERIFICATION_IN_PROGRESS",
  VERIFICATION_APPROVED: "VERIFICATION_APPROVED",
  VERIFICATION_DECLINED: "VERIFICATION_FAILED",
  VERIFICATION_EXPIRED: "VERIFICATION_FAILED",
  VERIFICATION_ABANDONED: "VERIFICATION_FAILED",
  VERIFICATION_REVIEW: "VERIFICATION_IN_PROGRESS",
  VERIFICATION_RESUBMISSION: "VERIFICATION_IN_PROGRESS",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  ELIGIBLE: "VERIFICATION_APPROVED",
  MEMBERSHIP_PENDING: "VERIFICATION_APPROVED",
  MEMBERSHIP_CREATED: "MEMBERSHIP_CREATED",
  MEMBERSHIP_FAILED: "VERIFICATION_APPROVED",
  PROCESSING_ERROR: "VERIFICATION_IN_PROGRESS",
};

export function publicStatusOf(application) {
  return PUBLIC_STATUS_MAP[application.status] || "VERIFICATION_IN_PROGRESS";
}

export function isTerminalStatus(status) {
  return ["NOT_ELIGIBLE", "MEMBERSHIP_CREATED", "VERIFICATION_FAILED"].includes(status);
}
