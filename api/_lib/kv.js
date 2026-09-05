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

export async function setIfNotExists(key, value, ttlSeconds) {
  if (usingRest()) {
    const result = await rest(["SET", key, JSON.stringify(value), "NX", "EX", String(ttlSeconds)]);
    return result === "OK";
  }
  const existing = memGet(key);
  if (existing) return false;
  memSet(key, value, Date.now() + ttlSeconds * 1000);
  return true;
}

export async function rpush(key, value, maxItems = 200) {
  if (usingRest()) {
    await rest(["RPUSH", key, JSON.stringify(value)]);
    await rest(["LTRIM", key, String(-maxItems), "-1"]);
    return;
  }
  const entry = memGet(key);
  const list = Array.isArray(entry?.value) ? entry.value : [];
  list.push(value);
  memSet(key, list.slice(-maxItems), null);
}

export async function lrange(key, start = 0, stop = -1) {
  if (usingRest()) {
    const result = await rest(["LRANGE", key, String(start), String(stop)]);
    if (!Array.isArray(result)) return [];
    return result.map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return { raw: item };
      }
    });
  }
  const entry = memGet(key);
  const list = Array.isArray(entry?.value) ? entry.value : [];
  const sliced = stop === -1 ? list.slice(start) : list.slice(start, stop + 1);
  return sliced;
}
