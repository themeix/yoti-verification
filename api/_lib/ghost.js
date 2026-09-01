import crypto from "node:crypto";
import { config } from "./env.js";

function ghostJwt(adminKey) {
  const [keyId, secret] = adminKey.split(":");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT", kid: keyId };
  const payload = { iat: now, exp: now + 300, aud: "/admin/" };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signing = `${b64(header)}.${b64(payload)}`;
  const signature = crypto
    .createHmac("sha256", Buffer.from(secret, "hex"))
    .update(signing)
    .digest("base64url");
  return `${signing}.${signature}`;
}

async function adminFetch(path, { method = "GET", body } = {}) {
  const cfg = config();
  const res = await fetch(`${cfg.ghost.url}/ghost/api/admin${path}`, {
    method,
    headers: {
      Authorization: `Ghost ${ghostJwt(cfg.ghost.adminKey)}`,
      "Content-Type": "application/json",
      "Accept-Version": "v5.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`ghost ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

export async function listTiers() {
  const body = await adminFetch("/tiers/?limit=all");
  return (body && body.tiers) || [];
}

export async function findMemberByEmail(email) {
  const filter = encodeURIComponent(`email:${email}`);
  const body = await adminFetch(`/members/?limit=1&filter=${filter}`);
  const members = (body && body.members) || [];
  return members.length > 0 ? members[0] : null;
}

function programmeLabelNames(cfg) {
  return [cfg.programmeLabel, cfg.verifiedLabel];
}

function mergeLabels(existingMembers, cfg) {
  const wanted = programmeLabelNames(cfg);
  const byName = new Map();
  for (const label of existingMembers || []) {
    if (label && label.name) byName.set(label.name.toLowerCase(), { name: label.name });
  }
  for (const name of wanted) {
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name });
  }
  return Array.from(byName.values());
}

export async function ensureMember({ email, name }) {
  const cfg = config();
  const existing = await findMemberByEmail(email);
  if (existing) {
    return { member: existing, created: false };
  }
  const payload = {
    email,
    name,
    labels: programmeLabelNames(cfg).map((label) => ({ name: label })),
  };
  if (cfg.ghost.newsletterId) {
    payload.newsletters = [{ id: cfg.ghost.newsletterId }];
  }
  const body = await adminFetch("/members/", { method: "POST", body: { members: [payload] } });
  const created = body.members && body.members[0];
  if (!created) {
    throw new Error("ghost member create returned no member");
  }
  return { member: created, created: true };
}

export async function compMember(member, expiryIso) {
  const cfg = config();
  const edit = {
    comped: true,
    labels: mergeLabels(member.labels, cfg),
    updated_at: member.updated_at,
  };
  edit[cfg.ghost.compedExpiryField] = expiryIso;
  const body = await adminFetch(`/members/${member.id}/`, {
    method: "PUT",
    body: { members: [edit] },
  });
  const updated = (body.members && body.members[0]) || null;
  return updated;
}

export async function triggerMagicLink(email) {
  const cfg = config();
  if (!cfg.ghost.sendMagicLink) return { sent: false, reason: "disabled" };
  try {
    const res = await fetch(`${cfg.ghost.url}/ghost/api/members/magic-link/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, requestSrc: "portal" }),
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, reason: "error" };
  }
}

export function startGuard(member, cfg) {
  if (!member) return { blocked: false };
  const activePaid = (member.subscriptions || []).some(
    (s) => s.status === "active" && s.plan && s.plan.amount > 0,
  );
  if (activePaid) {
    return { blocked: true, code: "already_member", message: "This email already has an active paid membership." };
  }
  if (member.comped && member.status === "paid") {
    const labels = (member.labels || []).map((l) => (l.name || "").toLowerCase());
    if (labels.includes(cfg.programmeLabel.toLowerCase())) {
      return {
        blocked: true,
        code: "already_funded",
        message: "This email has already claimed the funded membership.",
      };
    }
  }
  return { blocked: false };
}
