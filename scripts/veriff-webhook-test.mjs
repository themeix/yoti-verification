import crypto from "node:crypto";
import { loadDotEnv } from "./lib-env.mjs";

loadDotEnv();

const base = (process.env.TARGET_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const sharedSecret = process.env.VERIFF_SHARED_SECRET || "";
const apiKey = process.env.VERIFF_API_KEY || "";

if (!sharedSecret) {
  console.error("missing VERIFF_SHARED_SECRET (see .env.local / .env.example)");
  process.exit(1);
}

function sign(rawBody) {
  return crypto.createHmac("sha256", sharedSecret).update(rawBody, "utf8").digest("hex");
}

function dobForAge(age, at = new Date()) {
  const d = new Date(at);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  return d.toISOString().slice(0, 10);
}

async function postJson(path, payload, extraHeaders = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function getStatus(applicationId) {
  const res = await fetch(`${base}/api/applications/${encodeURIComponent(applicationId)}`);
  return res.json();
}

function decisionWebhook({ sessionId, attemptId, status, code, vendorData, dob, estimatedAge }) {
  const verification = {
    id: sessionId,
    attemptId,
    vendorData,
    status,
    code,
    reason: null,
    reasonCode: null,
    decisionTime: new Date().toISOString(),
    person: dob
      ? { firstName: "Sandbox", lastName: "Test", dateOfBirth: dob, gender: null, nationality: null, idNumber: null }
      : null,
  };
  if (estimatedAge !== undefined) {
    verification.additionalVerifiedData = { estimatedAge };
  }
  return JSON.stringify({ status: "success", verification, technicalData: { ip: "127.0.0.1" } });
}

const scenarios = [
  { key: "pass21", age: 21, status: "approved", code: 9001, expect: "MEMBERSHIP_CREATED" },
  { key: "b16", age: 16, status: "approved", code: 9001, expect: "MEMBERSHIP_CREATED" },
  { key: "b25", age: 25, status: "approved", code: 9001, expect: "MEMBERSHIP_CREATED" },
  { key: "u15", age: 15, status: "approved", code: 9001, expect: "NOT_ELIGIBLE" },
  { key: "o26", age: 26, status: "approved", code: 9001, expect: "NOT_ELIGIBLE" },
  { key: "declined", age: 21, status: "declined", code: 9102, expect: "VERIFICATION_FAILED" },
  { key: "estimated21", estimatedAge: 21, status: "approved", code: 9001, expect: "MEMBERSHIP_CREATED" },
];

const emailPrefix = process.argv.find((arg) => arg.startsWith("--email-prefix="))?.slice("--email-prefix=".length) || "webhook-test";
const runTag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice("--tag=".length) || String(Date.now());

console.log(`target: ${base}`);
console.log(`application emails: ${emailPrefix}-<scenario>@example.com (tag ${runTag})\n`);

for (const scenario of scenarios) {
  const email = `${emailPrefix}-${scenario.key}-${runTag}@example.com`;
  const created = await postJson("/api/applications", {
    name: `Webhook Test ${scenario.key}`,
    email,
    consent: true,
  });

  if (created.status !== 200 || !created.body.applicationId) {
    console.log(`[${scenario.key}] application create failed -> HTTP ${created.status} ${JSON.stringify(created.body)}`);
    continue;
  }

  const raw = decisionWebhook({
    sessionId: `test-session-${runTag}-${scenario.key}`,
    attemptId: `attempt-${runTag}-${scenario.key}`,
    status: scenario.status,
    code: scenario.code,
    vendorData: created.body.applicationId,
    dob: scenario.age !== undefined ? dobForAge(scenario.age) : undefined,
    estimatedAge: scenario.estimatedAge,
  });

  const result = await postWebhookSigned(raw);
  const finalStatus = await getStatus(created.body.applicationId);
  console.log(
    `[${scenario.key}] expect=${scenario.expect} -> webhook HTTP ${result.status} ${JSON.stringify(result.body)} | status=${finalStatus.status}`,
  );

  const replay = await postWebhookSigned(raw);
  console.log(`  replay -> HTTP ${replay.status} ${JSON.stringify(replay.body)} (expect duplicate:true)`);
}

function postWebhookSigned(raw) {
  return postJson("/api/webhooks/veriff", raw, {
    "X-AUTH-CLIENT": apiKey,
    "X-HMAC-SIGNATURE": sign(raw),
  });
}

console.log("\nextra cases:");

const unknownRaw = decisionWebhook({
  sessionId: `unknown-${Date.now()}`,
  attemptId: `a-${Date.now()}`,
  status: "approved",
  code: 9001,
  vendorData: "not-a-real-application-id",
  dob: dobForAge(21),
});
const unknown = await postWebhookSigned(unknownRaw);
console.log(`[unknown-session] -> HTTP ${unknown.status} ${JSON.stringify(unknown.body)} (expect ignored)`);

const badSig = await postJson("/api/webhooks/veriff", unknownRaw, {
  "X-AUTH-CLIENT": apiKey,
  "X-HMAC-SIGNATURE": "deadbeef".repeat(8),
});
console.log(`[bad-signature] -> HTTP ${badSig.status} ${JSON.stringify(badSig.body)} (expect 401)`);

const malformed = await postJson(
  "/api/webhooks/veriff",
  "{not json",
  { "X-HMAC-SIGNATURE": sign("{not json") },
);
console.log(`[malformed-json] -> HTTP ${malformed.status} ${JSON.stringify(malformed.body)} (expect 400)`);

console.log("\nnote: MEMBERSHIP_CREATED scenarios create real comped members on the configured Ghost site;");
console.log("clean them up via Ghost Admin (filter label:Postcode Lottery Programme).");
