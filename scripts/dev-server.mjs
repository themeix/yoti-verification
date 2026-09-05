import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./lib-env.mjs";

loadDotEnv();

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const port = Number(process.env.PORT || 8080);

const { runCreateApplication, runGetApplication, runVeriffWebhook, runHealth } = await import("../api/_lib/handlers.js");

function send(res, status, headers, bodyText) {
  res.writeHead(status, headers);
  res.end(bodyText);
}

function sendJson(res, result) {
  send(res, result.status, result.headers, JSON.stringify(result.body));
}

function serveFile(res, file) {
  const full = path.join(publicDir, file);
  if (!fs.existsSync(full)) {
    send(res, 404, { "Content-Type": "text/plain" }, "not found");
    return;
  }
  const html = fs.readFileSync(full);
  send(res, 200, { "Content-Type": "text/html; charset=utf-8" }, html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const readRaw = () =>
    new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/landing.html")) {
      serveFile(res, "landing.html");
      return;
    }
    if (req.method === "GET" && (url.pathname === "/result" || url.pathname === "/result.html")) {
      serveFile(res, "result.html");
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, await runHealth());
      return;
    }
    if (req.method === "POST" && (url.pathname === "/api/applications" || url.pathname === "/applications")) {
      const raw = await readRaw();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "invalid_json" } });
        return;
      }
      const publicBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
      sendJson(
        res,
        await runCreateApplication({
          body,
          ip: req.socket.remoteAddress || "local",
          origin: req.headers.origin,
          publicBaseUrl,
        }),
      );
      return;
    }
    const applicationMatch = url.pathname.match(/^\/(?:api\/)?applications\/([^/]+)$/);
    if (req.method === "GET" && applicationMatch) {
      sendJson(res, await runGetApplication({ applicationId: decodeURIComponent(applicationMatch[1]), origin: req.headers.origin }));
      return;
    }
    if (req.method === "POST" && (url.pathname === "/api/webhooks/veriff" || url.pathname === "/webhooks/veriff")) {
      const raw = await readRaw();
      sendJson(res, await runVeriffWebhook({ rawBody: raw, headers: req.headers }));
      return;
    }
    send(res, 404, { "Content-Type": "application/json" }, JSON.stringify({ error: "not_found" }));
  } catch (err) {
    console.error(err);
    send(res, 500, { "Content-Type": "application/json" }, JSON.stringify({ error: "internal" }));
  }
});

server.listen(port, () => {
  console.log(`dev server on http://localhost:${port}`);
  console.log(`health: http://localhost:${port}/health`);
});
