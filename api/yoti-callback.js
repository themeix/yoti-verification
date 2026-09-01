import { runCallback } from "./_lib/handlers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
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
  const result = await runCallback({ body });
  res.writeHead(result.status, result.headers);
  res.end(JSON.stringify(result.body));
}
