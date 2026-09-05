import { config, missingConfig } from "./env.js";
import {
  jsonResponse,
  nowIso,
  addMonthsIso,
  todayKey,
  splitName,
  publicStatusOf,
  isTerminalStatus,
  clientIp,
} from "./util.js";
import { incrWithTtl, kvMode } from "./kv.js";
import {
  createSession,
  sessionIdFromCreated,
  verificationUrlFromCreated,
  verifyWebhookSignature,
  parseWebhook,
  getSessionDecision,
  decisionToWebhookShape,
} from "./veriff.js";
import {
  newApplication,
  createApplication,
  getApplication,
  getApplicationByEmail,
  getApplicationBySession,
  linkSession,
  transition,
  audit,
  getAudit,
  recordWebhookEvent,
  acquireLock,
  releaseLock,
} from "./store.js";
import { ensureMember, compMember, triggerMagicLink, findMemberByEmail, startGuard } from "./ghost.js";
import { evaluateDecision } from "./eligibility.js";
import crypto from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACTIVE_APPLICATION_STATUSES = [
  "APPLICATION_CREATED",
  "VERIFICATION_STARTED",
  "VERIFICATION_IN_PROGRESS",
  "VERIFICATION_REVIEW",
  "VERIFICATION_RESUBMISSION",
  "MEMBERSHIP_PENDING",
  "MEMBERSHIP_FAILED",
];

export async function runCreateApplication({ body, ip, origin, publicBaseUrl }) {
  const cfg = config();
  const missing = missingConfig(cfg);
  if (missing.length) {
    return jsonResponse(500, { error: "config_missing", missing }, origin);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const consent = body.consent === true;
  if (!name || name.length > 100) {
    return jsonResponse(400, { error: "invalid_name" }, origin);
  }
  if (!EMAIL_RE.test(email) || email.length > 320) {
    return jsonResponse(400, { error: "invalid_email" }, origin);
  }
  if (!consent) {
    return jsonResponse(400, { error: "consent_required" }, origin);
  }

  const day = todayKey();
  const emailCount = await incrWithTtl(`rl:email:${email}:${day}`, 86400);
  if (emailCount > cfg.maxApplicationsPerEmailPerDay) {
    return jsonResponse(429, { error: "too_many_attempts" }, origin);
  }
  const ipCount = await incrWithTtl(`rl:ip:${ip}:${day}`, 86400);
  if (ipCount > cfg.maxApplicationsPerIpPerDay) {
    return jsonResponse(429, { error: "too_many_attempts" }, origin);
  }

  try {
    const member = await findMemberByEmail(email);
    const guard = startGuard(member, cfg);
    if (guard.blocked) {
      return jsonResponse(409, { error: guard.code, message: guard.message }, origin);
    }
  } catch (err) {
    console.error("ghost guard failed", err.message);
    return jsonResponse(503, { error: "membership_system_unavailable" }, origin);
  }

  const existing = await getApplicationByEmail(email);
  if (existing) {
    if (existing.status === "NOT_ELIGIBLE") {
      return jsonResponse(409, { error: "not_eligible" }, origin);
    }
    if (existing.status === "MEMBERSHIP_CREATED") {
      return jsonResponse(409, { error: "already_funded" }, origin);
    }
    if (ACTIVE_APPLICATION_STATUSES.includes(existing.status)) {
      return jsonResponse(409, { error: "application_in_progress", applicationId: existing.id }, origin);
    }
  }

  const application = newApplication({ email, name });
  await createApplication(application);

  const { firstName, lastName } = splitName(name);
  const callbackBase = cfg.veriff.appBaseUrl || publicBaseUrl;
  const created = await createSession({
    firstName,
    lastName,
    vendorData: application.id,
    callback: `${callbackBase.replace(/\/+$/, "")}/result.html?application=${application.id}`,
  }).catch((err) => {
    console.error("veriff session create failed", err.status, JSON.stringify(err.body), err.message);
    return null;
  });

  const sessionId = created ? sessionIdFromCreated(created) : "";
  const verificationUrl = created ? verificationUrlFromCreated(created) : "";
  if (!sessionId || !verificationUrl) {
    await transition(application, "PROCESSING_ERROR", { veriffStatus: "session_create_failed" });
    await audit(application.id, "VERIFF_SESSION_CREATE_FAILED", application.status, {
      veriffStatus: created && created.status,
    });
    return jsonResponse(502, { error: "verification_unavailable", applicationId: application.id }, origin);
  }

  await linkSession(application, sessionId);
  await transition(application, "VERIFICATION_STARTED", { veriffStatus: "created" });
  await audit(application.id, "VERIFF_SESSION_CREATED", application.status, { sessionId });

  return jsonResponse(
    200,
    {
      applicationId: application.id,
      status: "VERIFICATION_STARTED",
      verificationUrl,
    },
    origin,
  );
}

export async function runGetApplication({ applicationId, origin }) {
  const cfg = config();
  const application = await getApplication(applicationId);
  if (!application) {
    return jsonResponse(404, { error: "not_found" }, origin);
  }
  return jsonResponse(
    200,
    {
      applicationId: application.id,
      status: publicStatusOf(application),
      terminal: isTerminalStatus(publicStatusOf(application)),
    },
    origin,
  );
}

export async function runVeriffWebhook({ rawBody, headers }) {
  const cfg = config();
  const missing = missingConfig(cfg);
  if (missing.length) {
    return jsonResponse(500, { error: "config_missing", missing });
  }

  const signature =
    headers["x-hmac-signature"] || headers["X-Hmac-Signature"] || headers["X-HMAC-SIGNATURE"] || "";
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn(
      JSON.stringify({ event: "WEBHOOK_SIGNATURE_INVALID", payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 16) }),
    );
    return jsonResponse(401, { error: "invalid_signature" });
  }

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const parsed = parseWebhook(body);
  if (!parsed.sessionId) {
    return jsonResponse(400, { error: "missing_session_id" });
  }

  const eventId = parsed.attemptId || `${parsed.sessionId}:${parsed.status}:${parsed.code || ""}`;
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const firstDelivery = await recordWebhookEvent({
    eventId,
    sessionId: parsed.sessionId,
    signatureValid: true,
    payloadHash,
  });
  if (!firstDelivery) {
    return jsonResponse(200, { duplicate: true });
  }

  const application =
    (await getApplicationBySession(parsed.sessionId)) ||
    (parsed.vendorData ? await getApplication(parsed.vendorData) : null);
  if (!application) {
    console.warn(JSON.stringify({ event: "WEBHOOK_UNKNOWN_SESSION", sessionId: parsed.sessionId }));
    return jsonResponse(200, { ignored: true, reason: "unknown_session" });
  }

  const locked = await acquireLock(application.id, cfg.lockTtlSeconds);
  if (!locked) {
    return jsonResponse(503, { error: "application_locked" });
  }

  try {
    await audit(application.id, "VERIFF_WEBHOOK_RECEIVED", application.status, {
      sessionId: parsed.sessionId,
      veriffStatus: parsed.status,
    });

    let effective = parsed;
    if (parsed.status === "approved" && !parsed.dateOfBirth && parsed.estimatedAge === null) {
      try {
        const decision = await getSessionDecision(parsed.sessionId);
        effective = decisionToWebhookShape(decision);
      } catch (err) {
        console.error("veriff decision fetch failed", err.status, JSON.stringify(err.body));
        return jsonResponse(502, { error: "decision_unavailable" });
      }
    }

    application.veriffStatus = effective.status;
    application.veriffDecision = effective.status;

    const veriffTerminal = ["approved", "declined", "expired", "abandoned"].includes(effective.status);
    if (!veriffTerminal) {
      const pendingStatus =
        effective.status === "resubmission_requested" ? "VERIFICATION_RESUBMISSION" : "VERIFICATION_REVIEW";
      await transition(application, pendingStatus);
      await audit(application.id, `VERIFICATION_${effective.status.toUpperCase()}`, application.status);
      return jsonResponse(200, { processed: application.status });
    }

    await transition(application, `VERIFICATION_${effective.status.toUpperCase()}`, {
      verifiedAt: nowIso(),
    });
    await audit(application.id, `VERIFICATION_${effective.status.toUpperCase()}`, application.status, {
      reason: effective.reason,
    });

    if (effective.status !== "approved") {
      return jsonResponse(200, { processed: application.status });
    }

    const outcome = evaluateDecision(effective, cfg);
    application.age = outcome.age;
    application.ageEligible = outcome.ok;

    if (!outcome.ok && outcome.status === "PROCESSING_ERROR") {
      await transition(application, "PROCESSING_ERROR", { veriffStatus: effective.status });
      await audit(application.id, "ELIGIBILITY_FAILED", application.status, { reason: outcome.reason });
      return jsonResponse(500, { error: "age_not_available" });
    }

    if (!outcome.ok) {
      await transition(application, "NOT_ELIGIBLE");
      await audit(application.id, "ELIGIBILITY_FAILED", application.status, {
        reason: outcome.reason,
        age: outcome.age,
        ageSource: outcome.ageSource || "date_of_birth",
      });
      return jsonResponse(200, { processed: application.status });
    }

    await transition(application, "ELIGIBLE");
    await audit(application.id, "ELIGIBILITY_PASSED", application.status, {
      age: outcome.age,
      ageSource: outcome.ageSource,
    });
    await transition(application, "MEMBERSHIP_PENDING");

    const existingMember = await findMemberByEmail(application.email);
    const labels = (existingMember && existingMember.labels ? existingMember.labels : []).map((l) =>
      (l.name || "").toLowerCase(),
    );
    if (existingMember && existingMember.comped && labels.includes(cfg.programmeLabel.toLowerCase())) {
      application.ghostMemberId = existingMember.id;
      await transition(application, "MEMBERSHIP_CREATED", { processedAt: nowIso() });
      await audit(application.id, "GHOST_MEMBER_EXISTS", application.status, {
        ghostMemberId: existingMember.id,
      });
      return jsonResponse(200, { processed: application.status, duplicate: true });
    }

    try {
      const ensured = await ensureMember({ email: application.email, name: application.name });
      const expiryIso = addMonthsIso(new Date(), cfg.membershipMonths);
      const updated = await compMember(ensured.member, expiryIso);
      application.ghostMemberId = updated ? updated.id : ensured.member.id;
      application.compedExpiry = expiryIso;
      await transition(application, "MEMBERSHIP_CREATED", { processedAt: nowIso() });
      await audit(application.id, "GHOST_MEMBER_CREATED", application.status, {
        ghostMemberId: application.ghostMemberId,
        created: ensured.created,
        compedExpiry: expiryIso,
      });
    } catch (err) {
      console.error("ghost member write failed", err.status, JSON.stringify(err.body));
      await transition(application, "MEMBERSHIP_FAILED");
      await audit(application.id, "MEMBERSHIP_FAILED", application.status, { reason: err.message });
      return jsonResponse(500, { error: "membership_system_unavailable" });
    }

    const magicLink = await triggerMagicLink(application.email);
    await audit(application.id, "EMAIL_SENT", application.status, {
      channel: magicLink.sent ? "ghost_magic_link" : "ghost_magic_link_failed",
    });

    return jsonResponse(200, { processed: application.status });
  } finally {
    await releaseLock(application.id);
  }
}

export async function runHealth() {
  const cfg = config();
  const application = { status: "APPLICATION_CREATED" };
  return jsonResponse(200, {
    ok: true,
    time: nowIso(),
    veriff: { apiUrlConfigured: Boolean(cfg.veriff.apiUrl), apiKeyConfigured: Boolean(cfg.veriff.apiKey) },
    kv: kvMode(),
    ghost: {
      urlConfigured: Boolean(cfg.ghost.url),
      newsletterConfigured: Boolean(cfg.ghost.newsletterId),
    },
    ageRange: [cfg.ageMin, cfg.ageMax],
    membershipMonths: cfg.membershipMonths,
    labels: [cfg.programmeLabel, cfg.verifiedLabel, cfg.fundedLabel],
    statusProbe: publicStatusOf(application),
  });
}
