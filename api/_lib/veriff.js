import crypto from "node:crypto";
import { config } from "./env.js";

const REQUEST_TIMEOUT_MS = 15000;

export function signPayload(rawBody) {
  const cfg = config();
  return crypto
    .createHmac("sha256", cfg.veriff.sharedSecret)
    .update(rawBody, "utf8")
    .digest("hex");
}

export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== "string") return false;
  const expected = signPayload(rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function veriffFetch(method, path, body) {
  const cfg = config();
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const headers = {
    "X-AUTH-CLIENT": cfg.veriff.apiKey,
    "Content-Type": "application/json",
  };
  if (rawBody !== "") {
    headers["X-HMAC-SIGNATURE"] = signPayload(rawBody);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${cfg.veriff.apiUrl}${path}`, {
      method,
      headers,
      body: rawBody === "" ? undefined : rawBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`veriff ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

export async function createSession({ firstName, lastName, vendorData, callback }) {
  const verification = {
    vendorData,
    timestamp: new Date().toISOString(),
  };
  if (firstName || lastName) {
    verification.person = { firstName, lastName };
  }
  if (callback && callback.startsWith("https://")) {
    verification.callback = callback;
  }
  return veriffFetch("POST", "/v1/sessions", { verification });
}

export async function getSessionDecision(sessionId) {
  return veriffFetch("GET", `/v1/sessions/${encodeURIComponent(sessionId)}/decision`);
}

export function sessionIdFromCreated(created) {
  const verification = created && created.verification ? created.verification : {};
  const candidates = [verification.id, verification.sessionId];
  const id = candidates.find((v) => typeof v === "string" && v.length > 0);
  return id || "";
}

export function verificationUrlFromCreated(created) {
  const verification = (created && created.verification) || {};
  const url = [verification.url, verification.verificationUrl].find(
    (v) => typeof v === "string" && v.length > 0,
  );
  return url || "";
}

export function parseWebhook(body) {
  const verification = (body && body.verification) || {};
  const person = verification.person || {};
  const sessionId =
    [verification.id, verification.sessionId, body && body.id].find(
      (v) => typeof v === "string" && v.length > 0,
    ) || "";
  return {
    sessionId,
    attemptId: typeof verification.attemptId === "string" ? verification.attemptId : "",
    status: typeof verification.status === "string" ? verification.status : typeof body.status === "string" && body.status !== "success" ? body.status : "",
    code: verification.code,
    reason: verification.reason || null,
    vendorData: typeof verification.vendorData === "string" ? verification.vendorData : "",
    firstName: person.firstName || "",
    lastName: person.lastName || "",
    dateOfBirth: person.dateOfBirth || "",
    estimatedAge:
      verification.additionalVerifiedData && typeof verification.additionalVerifiedData.estimatedAge === "number"
        ? verification.additionalVerifiedData.estimatedAge
        : null,
  };
}

export function decisionToWebhookShape(decision) {
  const verification = (decision && decision.verification) || {};
  return parseWebhook({ status: decision ? decision.status : "", verification });
}
