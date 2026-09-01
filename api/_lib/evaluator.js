import { ageAt, findDateOfBirth } from "./util.js";

export function evaluateSession(session, cfg) {
  const checks = (session && session.checks) || [];
  const authenticity = checks.find((check) => /AUTHENTICITY/i.test(check.type || ""));
  if (!authenticity) {
    return { ok: false, reason: "no_authenticity_check" };
  }
  const state = (authenticity.state || authenticity.status || "").toUpperCase();
  if (state && state !== "DONE" && state !== "COMPLETED") {
    return { ok: false, reason: "checks_incomplete" };
  }
  const recommendation =
    authenticity.report && authenticity.report.recommendation
      ? String(authenticity.report.recommendation.value || "").toUpperCase()
      : "";
  if (!["APPROVE", "PASS"].includes(recommendation)) {
    return { ok: false, reason: "document_not_authentic" };
  }
  const dob = findDateOfBirth(session);
  if (!dob) {
    return { ok: false, reason: "dob_not_found" };
  }
  const age = ageAt(dob);
  if (age === null || Number.isNaN(age)) {
    return { ok: false, reason: "dob_unparseable" };
  }
  if (age < cfg.ageMin) {
    return { ok: false, reason: "under_age", age };
  }
  if (age > cfg.ageMax) {
    return { ok: false, reason: "over_age", age };
  }
  return { ok: true, reason: "eligible", age, dob };
}
