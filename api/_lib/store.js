import crypto from "node:crypto";
import { getJson, setJsonEx, setIfNotExists, del, rpush, lrange } from "./kv.js";
import { nowIso } from "./util.js";

const STATUS_FLOW = {
  APPLICATION_CREATED: 0,
  VERIFICATION_STARTED: 1,
  VERIFICATION_IN_PROGRESS: 2,
  VERIFICATION_APPROVED: 3,
  VERIFICATION_DECLINED: 3,
  VERIFICATION_EXPIRED: 3,
  VERIFICATION_ABANDONED: 3,
  VERIFICATION_REVIEW: 2,
  VERIFICATION_RESUBMISSION: 2,
  NOT_ELIGIBLE: 4,
  ELIGIBLE: 4,
  MEMBERSHIP_PENDING: 5,
  MEMBERSHIP_CREATED: 6,
  MEMBERSHIP_FAILED: 5,
  PROCESSING_ERROR: 2,
};

export function newApplication({ email, name }) {
  const id = crypto.randomUUID();
  return {
    id,
    referenceId: `programme-${id}`,
    email,
    name,
    veriffSessionId: null,
    veriffStatus: null,
    veriffDecision: null,
    ageEligible: null,
    age: null,
    status: "APPLICATION_CREATED",
    ghostMemberId: null,
    compedExpiry: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    verifiedAt: null,
    processedAt: null,
  };
}

export async function createApplication(application) {
  await setJsonEx(`app:${application.id}`, application, 60 * 60 * 24 * 90);
  await setJsonEx(`email:${application.email}`, application.id, 60 * 60 * 24 * 90);
  await audit(application.id, "APPLICATION_CREATED", application.status);
  return application;
}

export async function getApplication(applicationId) {
  return getJson(`app:${applicationId}`);
}

export async function getApplicationByEmail(email) {
  const id = await getJson(`email:${email}`);
  if (!id) return null;
  return getApplication(id);
}

export async function getApplicationBySession(sessionId) {
  const id = await getJson(`session:${sessionId}`);
  if (id) {
    const application = await getApplication(id);
    if (application) return application;
  }
  return null;
}

export async function linkSession(application, sessionId) {
  application.veriffSessionId = sessionId;
  await setJsonEx(`session:${sessionId}`, application.id, 60 * 60 * 24 * 90);
}

export async function transition(application, status, extra = {}) {
  if (STATUS_FLOW[status] === undefined) {
    throw new Error(`unknown_status:${status}`);
  }
  const current = STATUS_FLOW[application.status] ?? 0;
  if (STATUS_FLOW[status] < current && status !== "PROCESSING_ERROR") {
    return application;
  }
  application.status = status;
  application.updatedAt = nowIso();
  Object.assign(application, extra);
  await setJsonEx(`app:${application.id}`, application, 60 * 60 * 24 * 90);
  return application;
}

export async function audit(applicationId, eventType, status, metadata = {}) {
  const entry = {
    timestamp: nowIso(),
    eventType,
    status,
    metadata,
  };
  await rpush(`audit:${applicationId}`, entry);
  console.log(JSON.stringify({ event: eventType, applicationId, status }));
  return entry;
}

export async function getAudit(applicationId) {
  return lrange(`audit:${applicationId}`);
}

export async function recordWebhookEvent({ eventId, sessionId, signatureValid, payloadHash }) {
  const stored = await setIfNotExists(
    `whevent:veriff:${eventId}`,
    { sessionId, signatureValid, payloadHash, receivedAt: nowIso() },
    60 * 60 * 24 * 90,
  );
  return stored;
}

export async function acquireLock(applicationId, ttlSeconds) {
  return setIfNotExists(`lock:${applicationId}`, { at: nowIso() }, ttlSeconds);
}

export async function releaseLock(applicationId) {
  await del(`lock:${applicationId}`);
}
