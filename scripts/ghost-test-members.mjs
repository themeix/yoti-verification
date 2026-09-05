import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.join(here, "..", ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

function ghostJwt(adminKey) {
  const [keyId, secret] = adminKey.split(":");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT", kid: keyId };
  const payload = { iat: now, exp: now + 300, aud: "/admin/" };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signing = `${b64(header)}.${b64(payload)}`;
  const signature = crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(signing).digest("base64url");
  return `${signing}.${signature}`;
}

const base = `${env.GHOST_URL}/ghost/api/admin`;
const headers = {
  Authorization: `Ghost ${ghostJwt(env.GHOST_ADMIN_API_KEY)}`,
  "Content-Type": "application/json",
  "Accept-Version": "v5.0",
};

async function listTestMembers() {
  const filter = encodeURIComponent("email:~'webhook-test'");
  const res = await fetch(`${base}/members/?limit=50&filter=${filter}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`list -> ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return data.members || [];
}

const action = process.argv[2] || "list";
if (action === "list") {
  const members = await listTestMembers();
  console.log(`found ${members.length} webhook-test members`);
  for (const m of members) {
    console.log(`- ${m.id} ${m.email} | comped: ${m.comped} | status: ${m.status} | labels: ${(m.labels || []).map((l) => l.name).join(", ")}`);
    if (m.note) console.log(`  note: ${m.note.split("\n").join(" | ")}`);
  }
} else if (action === "delete") {
  const members = await listTestMembers();
  console.log(`deleting ${members.length} webhook-test members`);
  for (const m of members) {
    const res = await fetch(`${base}/members/${m.id}/`, { method: "DELETE", headers });
    console.log(`- ${m.email} -> HTTP ${res.status}`);
  }
}
