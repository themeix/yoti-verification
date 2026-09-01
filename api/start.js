import { runStart } from "./_lib/handlers.js";
import { corsHeaders, clientIp } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req.headers.origin));
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST, OPTIONS" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${proto}://${host}`;
  const result = await runStart({
    body,
    ip: clientIp(req.headers),
    origin: req.headers.origin,
    publicBaseUrl,
  });
  res.writeHead(result.status, result.headers);
  res.end(JSON.stringify(result.body));
}
