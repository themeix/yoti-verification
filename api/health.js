import { runHealth } from "./_lib/handlers.js";

export default async function handler(req, res) {
  const result = runHealth();
  res.writeHead(result.status, result.headers);
  res.end(JSON.stringify(result.body));
}
