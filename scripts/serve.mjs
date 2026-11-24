#!/usr/bin/env node
// Serve dist/site/ at http://localhost:8010/ (or PORT). Localhost only.
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/site");
const port = Number(process.env.PORT || 8010);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

try {
  statSync(path.join(site, "index.html"));
} catch {
  console.error("serve: dist/site/ is not built; run 'npm run build' first");
  process.exit(1);
}

http
  .createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
    let file = path.join(site, path.normalize(decodeURIComponent(new URL(req.url, "http://localhost").pathname)));
    if (file !== site && !file.startsWith(site + path.sep)) return res.writeHead(403).end();
    try {
      if (statSync(file).isDirectory()) file = path.join(file, "index.html");
      statSync(file);
    } catch {
      return res.writeHead(404).end("not found");
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1", () => console.log(`Serving dist/site/ at http://localhost:${port}/ (Ctrl+C to stop)`));
