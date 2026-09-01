import crypto from "node:crypto";
import { config } from "./env.js";

const REQUEST_TIMEOUT_MS = 15000;

export function sessionSpecification(cfg, callbackUrl) {
  const spec = {
    protocol: "v2",
    ttl: cfg.yoti.sessionTtlMinutes * 60,
    requested_checks: [
      {
        type: "ID_DOCUMENT_AUTHENTICITY",
        config: { manual_check: "FALLBACK" },
      },
    ],
    requested_tasks: [
      {
        type: "ID_DOCUMENT_TEXT_DATA_EXTRACTION",
        config: { manual_extract: true },
      },
    ],
  };
  if (callbackUrl.startsWith("https://")) {
    spec.notifications = {
      endpoint: callbackUrl,
      topic: "SESSION_COMPLETION",
      topics: ["SESSION_COMPLETION"],
    };
  }
  return spec;
}

function buildSignedRequest(method, path, body) {
  const cfg = config();
  const query = `sdkId=${encodeURIComponent(cfg.yoti.sdkId)}&nonce=${crypto.randomUUID()}&timestamp=${Date.now()}`;
  const endpoint = `${path}?${query}`;
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  let message = `${method}&${endpoint}`;
  if (rawBody) {
    message += `&${Buffer.from(rawBody, "utf8").toString("base64")}`;
  }
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message, "utf8");
  const digest = signer.sign(cfg.yoti.privateKey, "base64");
  return {
    url: `${cfg.yoti.baseUrl}${endpoint}`,
    headers: {
      "Content-Type": "application/json",
      "X-Yoti-Auth-Digest": digest,
    },
    rawBody,
  };
}

async function yotiFetch(method, path, body) {
  const request = buildSignedRequest(method, path, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(request.url, {
      method,
      headers: request.headers,
      body: request.rawBody === "" ? undefined : request.rawBody,
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
    const err = new Error(`yoti ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

export async function createSession(spec) {
  return yotiFetch("POST", "/sessions", spec);
}

export async function getSession(sessionId) {
  return yotiFetch("GET", `/sessions/${encodeURIComponent(sessionId)}`);
}

export async function configureSessionResponse(sessionId, responseConfig) {
  return yotiFetch("PUT", `/sessions/${encodeURIComponent(sessionId)}/response-config`, responseConfig);
}

export async function configureApplicationResponse(responseConfig) {
  const cfg = config();
  return yotiFetch("PUT", `/apps/${encodeURIComponent(cfg.yoti.sdkId)}/response-config`, responseConfig);
}

export function sandboxResponseConfig({ approve, documentFields }) {
  return {
    check_reports: {
      ID_DOCUMENT_AUTHENTICITY: [
        {
          report: {
            recommendation: { value: approve ? "APPROVE" : "REJECT" },
            breakdown: [],
          },
        },
      ],
    },
    task_results: {
      ID_DOCUMENT_TEXT_DATA_EXTRACTION: [
        {
          result: {
            document_fields: documentFields,
          },
        },
      ],
    },
  };
}

export function sessionTokenFrom(createResponse) {
  if (!createResponse || typeof createResponse !== "object") return "";
  const candidates = [
    createResponse.client_session_token_iso8601,
    createResponse.clientSessionTokenIso8601,
    createResponse.client_session_token,
    createResponse.clientSessionToken,
    createResponse.session_token,
  ];
  const token = candidates.find((t) => typeof t === "string" && t.length > 0);
  return token || "";
}

export function sessionIdFrom(createResponse) {
  if (!createResponse || typeof createResponse !== "object") return "";
  const candidates = [createResponse.session_id, createResponse.sessionId, createResponse.id];
  const id = candidates.find((v) => typeof v === "string" && v.length > 0);
  return id || "";
}

export function buildRedirectUrl(token) {
  const cfg = config();
  return cfg.yoti.redirectTemplate
    .replace("{sdkId}", encodeURIComponent(cfg.yoti.sdkId))
    .replace("{token}", encodeURIComponent(token));
}
