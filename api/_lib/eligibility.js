import { ageAt } from "./util.js";

export function isEligibleAge(age, cfg) {
  return age >= cfg.ageMin && age <= cfg.ageMax;
}

export function evaluateDecision({ status, dateOfBirth, estimatedAge }, cfg) {
  if (status !== "approved") {
    return { ok: false, status: `VERIFICATION_${status ? status.toUpperCase() : "UNKNOWN"}`, reason: status || "unknown_status", age: null };
  }
  if (dateOfBirth) {
    const age = ageAt(dateOfBirth);
    if (age === null || Number.isNaN(age)) {
      return { ok: false, status: "PROCESSING_ERROR", reason: "dob_unparseable", age: null };
    }
    if (!isEligibleAge(age, cfg)) {
      return { ok: false, status: "NOT_ELIGIBLE", reason: age < cfg.ageMin ? "under_age" : "over_age", age };
    }
    return { ok: true, status: "ELIGIBLE", reason: "eligible", age, ageSource: "date_of_birth" };
  }
  if (estimatedAge !== null && estimatedAge !== undefined) {
    if (!isEligibleAge(estimatedAge, cfg)) {
      return { ok: false, status: "NOT_ELIGIBLE", reason: estimatedAge < cfg.ageMin ? "under_age" : "over_age", age: estimatedAge };
    }
    return { ok: true, status: "ELIGIBLE", reason: "eligible", age: estimatedAge, ageSource: "estimated_age" };
  }
  return { ok: false, status: "PROCESSING_ERROR", reason: "age_not_available", age: null };
}
