import { runGetApplication } from "../../_lib/handlers.js";
import { corsHeaders } from "../../_lib/util.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req.headers.origin));
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, OPTIONS" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  const segments = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname.split("/").filter(Boolean);
  const applicationId = segments[segments.length - 1];
  const result = await runGetApplication({ applicationId, origin: req.headers.origin });
  res.writeHead(result.status, result.headers);
  res.end(JSON.stringify(result.body));
}
