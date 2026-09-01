import { config } from "./env.js";

const memory = new Map();

function memSet(key, value, expiresAtMs) {
  memory.set(key, { value, expiresAtMs });
}

function memGet(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs && entry.expiresAtMs < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry;
}

async function rest(command) {
  const cfg = config().kv;
  const res = await fetch(cfg.restUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.restToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`kv rest ${res.status}`);
  }
  const body = await res.json();
  return body.result;
}

function usingRest() {
  const cfg = config().kv;
  return Boolean(cfg.restUrl && cfg.restToken);
}

export function kvMode() {
  return usingRest() ? "upstash" : "memory";
}

export async function getJson(key) {
  if (usingRest()) {
    const result = await rest(["GET", key]);
    if (result === null) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }
  const entry = memGet(key);
  return entry ? entry.value : null;
}

export async function setJsonEx(key, value, ttlSeconds) {
  if (usingRest()) {
    await rest(["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]);
    return;
  }
  memSet(key, value, Date.now() + ttlSeconds * 1000);
}

export async function del(key) {
  if (usingRest()) {
    await rest(["DEL", key]);
    return;
  }
  memory.delete(key);
}

export async function incrWithTtl(key, ttlSeconds) {
  if (usingRest()) {
    const count = await rest(["INCR", key]);
    if (count === 1) {
      await rest(["EXPIRE", key, String(ttlSeconds)]);
    }
    return count;
  }
  const entry = memGet(key);
  const next = entry ? Number(entry.value) + 1 : 1;
  memSet(key, next, Date.now() + ttlSeconds * 1000);
  return next;
}
