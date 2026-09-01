import { config, missingConfig } from "./env.js";
import { jsonResponse, nowIso, addMonthsIso, todayKey, extractSessionId } from "./util.js";
import { getJson, setJsonEx, del, incrWithTtl, kvMode } from "./kv.js";
import {
  sessionSpecification,
  createSession,
  getSession,
  sessionTokenFrom,
  sessionIdFrom,
  buildRedirectUrl,
} from "./yoti.js";
import { ensureMember, compMember, triggerMagicLink, findMemberByEmail, startGuard } from "./ghost.js";
import { evaluateSession } from "./evaluator.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function notifyMake(payload) {
  const cfg = config();
  if (!cfg.make.webhookUrl) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(cfg.make.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "age_verification_outcome", ...payload }),
      signal: controller.signal,
    });
  } catch (err) {
    console.warn("make notify failed", err.message);
  } finally {
    clearTimeout(timer);
  }
}

export async function runStart({ body, ip, origin, publicBaseUrl }) {
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
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse(400, { error: "invalid_email" }, origin);
  }
  if (!consent) {
    return jsonResponse(400, { error: "consent_required" }, origin);
  }

  const day = todayKey();
  const emailCount = await incrWithTtl(`rl:email:${email}:${day}`, 86400);
  if (emailCount > cfg.maxSessionsPerEmailPerDay) {
    return jsonResponse(429, { error: "too_many_attempts" }, origin);
  }
  const ipCount = await incrWithTtl(`rl:ip:${ip}:${day}`, 86400);
  if (ipCount > cfg.maxSessionsPerIpPerDay) {
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
    return jsonResponse(503, { error: "verification_unavailable" }, origin);
  }

  const callbackUrl = `${publicBaseUrl.replace(/\/+$/, "")}/api/yoti-callback`;
  const spec = sessionSpecification(cfg, callbackUrl);

  let created;
  try {
    created = await createSession(spec);
  } catch (err) {
    console.error(
      "yoti session create failed",
      err.status,
      JSON.stringify(err.body),
      err.message,
      err.cause ? String(err.cause) : "",
    );
    return jsonResponse(502, { error: "yoti_unavailable" }, origin);
  }

  const sessionId = sessionIdFrom(created);
  const token = sessionTokenFrom(created);
  if (!sessionId || !token) {
    console.error("yoti session create malformed", JSON.stringify(created));
    return jsonResponse(502, { error: "yoti_malformed_response" }, origin);
  }

  await setJsonEx(
    `pending:${sessionId}`,
    { name, email, createdAt: nowIso() },
    cfg.pendingTtlSeconds,
  );

  return jsonResponse(200, { yotiUrl: buildRedirectUrl(token), sessionId }, origin);
}

export async function runCallback({ body }) {
  const cfg = config();
  const missing = missingConfig(cfg);
  if (missing.length) {
    return jsonResponse(500, { error: "config_missing", missing });
  }
  const sessionId = extractSessionId(body);
  if (!sessionId) {
    return jsonResponse(400, { error: "missing_session_id" });
  }

  const pending = await getJson(`pending:${sessionId}`);
  if (!pending) {
    return jsonResponse(200, { ignored: true, reason: "unknown_or_already_processed" });
  }

  let session;
  try {
    session = await getSession(sessionId);
  } catch (err) {
    console.error("yoti session retrieve failed", err.status, JSON.stringify(err.body));
    return jsonResponse(502, { error: "yoti_unavailable" });
  }

  const outcome = evaluateSession(session, cfg);

  if (!outcome.ok) {
    await del(`pending:${sessionId}`);
    await notifyMake({
      timestamp: nowIso(),
      sessionId,
      email: pending.email,
      name: pending.name,
      result: "fail",
      reason: outcome.reason,
      age: outcome.age === undefined ? null : outcome.age,
    });
    return jsonResponse(200, { result: "fail", reason: outcome.reason });
  }

  let memberResult;
  try {
    const ensured = await ensureMember({ email: pending.email, name: pending.name });
    const expiryIso = addMonthsIso(new Date(), cfg.membershipMonths);
    const updated = await compMember(ensured.member, expiryIso);
    memberResult = {
      memberId: updated ? updated.id : ensured.member.id,
      created: ensured.created,
      compedExpiry: expiryIso,
      compedConfirmed: Boolean(updated && updated.comped),
    };
  } catch (err) {
    console.error("ghost member write failed", err.status, JSON.stringify(err.body));
    await notifyMake({
      timestamp: nowIso(),
      sessionId,
      email: pending.email,
      name: pending.name,
      result: "error",
      stage: "ghost",
      reason: err.message,
    });
    return jsonResponse(500, { error: "ghost_unavailable" });
  }

  const magicLink = await triggerMagicLink(pending.email);
  await del(`pending:${sessionId}`);
  await notifyMake({
    timestamp: nowIso(),
    sessionId,
    email: pending.email,
    name: pending.name,
    result: "pass",
    reason: outcome.reason,
    age: outcome.age,
    ghostMemberId: memberResult.memberId,
    created: memberResult.created,
    compedExpiry: memberResult.compedExpiry,
    magicLinkSent: magicLink.sent,
  });

  return jsonResponse(200, { result: "pass", ...memberResult });
}

export function runHealth() {
  const cfg = config();
  return jsonResponse(200, {
    ok: true,
    time: nowIso(),
    yoti: { sdkIdConfigured: Boolean(cfg.yoti.sdkId), baseUrl: cfg.yoti.baseUrl },
    kv: kvMode(),
    ghost: {
      urlConfigured: Boolean(cfg.ghost.url),
      newsletterConfigured: Boolean(cfg.ghost.newsletterId),
      compedExpiryField: cfg.ghost.compedExpiryField,
    },
    make: { webhookConfigured: Boolean(cfg.make.webhookUrl) },
    ageRange: [cfg.ageMin, cfg.ageMax],
    membershipMonths: cfg.membershipMonths,
    labels: [cfg.programmeLabel, cfg.verifiedLabel],
  });
}
