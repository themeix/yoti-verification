import { loadDotEnv } from "./lib-env.mjs";

loadDotEnv();

const { config } = await import("../api/_lib/env.js");
const { sessionSpecification, createSession, sessionIdFrom, sessionTokenFrom, buildRedirectUrl, signedHeaders } = await import("../api/_lib/yoti.js");

const callbackUrl =
  process.argv.find((arg) => arg.startsWith("--callback="))?.slice("--callback=".length) ||
  process.env.YOTI_CALLBACK_URL ||
  "http://localhost:8080/api/yoti-callback";

function dobForAge(age, at = new Date()) {
  const d = new Date(at);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  return d.toISOString().slice(0, 10);
}

const scenarios = [
  { key: "u15", age: 15, approve: true, expect: "fail/under_age" },
  { key: "b16", age: 16, approve: true, expect: "pass" },
  { key: "ok21", age: 21, approve: true, expect: "pass" },
  { key: "b25", age: 25, approve: true, expect: "pass" },
  { key: "o26", age: 26, approve: true, expect: "fail/over_age" },
  { key: "badoc", age: 21, approve: false, expect: "fail/document_not_authentic" },
];

const cfg = config();
if (!cfg.yoti.sdkId || !cfg.yoti.privateKey) {
  console.error("missing YOTI_SDK_ID / YOTI_PRIVATE_KEY (see .env.example)");
  process.exit(1);
}

for (const scenario of scenarios) {
  const spec = sessionSpecification(cfg, callbackUrl);
  let created;
  try {
    created = await createSession(spec);
  } catch (err) {
    console.error(`\n[${scenario.key}] session create failed ${err.status}`);
    console.error(JSON.stringify(err.body, null, 2));
    continue;
  }
  const sessionId = sessionIdFrom(created);
  const token = sessionTokenFrom(created);

  const responseConfig = {
    documents: [
      {
        document_type: "PASSPORT",
        issuing_country: "GBR",
        document_fields: {
          date_of_birth: dobForAge(scenario.age),
          expiry_date: "2032-01-01",
          given_names: "Sandbox",
          family_name: scenario.key.toUpperCase(),
          nationality: "GBR",
        },
      },
    ],
    checks: [
      {
        type: "ID_DOCUMENT_AUTHENTICITY",
        recommendation: { value: scenario.approve ? "APPROVE" : "REJECT" },
      },
    ],
  };

  const path = `/sessions/${sessionId}/response-config`;
  const raw = JSON.stringify(responseConfig);
  const res = await fetch(`${cfg.yoti.baseUrl}${path}`, {
    method: "POST",
    headers: signedHeaders(raw),
    body: raw,
  });
  const text = await res.text();

  console.log(`\n[${scenario.key}] expect=${scenario.expect} dob=${dobForAge(scenario.age)}`);
  console.log(`  session_id: ${sessionId}`);
  console.log(`  redirect:   ${buildRedirectUrl(token)}`);
  console.log(`  callback:   POST ${callbackUrl} {"session_id":"${sessionId}"}`);
  if (!res.ok) {
    console.error(`  response-config FAILED ${res.status}`);
    console.error(`  ${text}`);
  } else {
    console.log(`  response-config ok`);
  }
}

console.log("\nnote: sandbox sessions still need the hosted flow driven (open the redirect URL)");
console.log("note: response-config schema is written per current docs; if a scenario FAILED above, align field names with https://developers.yoti.com/identity-verification/configure-sandbox-response");
