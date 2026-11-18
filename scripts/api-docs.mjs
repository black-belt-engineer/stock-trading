#!/usr/bin/env node
// Serves docs/openapi.yaml in Swagger UI: `pnpm docs:api` → http://localhost:8080
//
// API paths are proxied to the BFF like the Vite dev proxy does, so "Try it out" works from the
// same origin without CORS. The BFF's `session` cookie is set when you log in to the app on
// http://localhost:5173; cookies are not separated by port, so this page sends it too. The port
// follows the BFF's default; override with BFF_URL and DOCS_PORT.
import { readFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = join(ROOT, "docs", "openapi.yaml");
const PORT = Number(process.env.DOCS_PORT ?? 8080);
const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14";

const BFF = process.env.BFF_URL ?? "http://localhost:3005";

/** Path prefix → upstream. First match wins. The BFF adds the bearer token and forwards to the services. */
const ROUTES = [
  ["/bff/", BFF],
  ["/quotes/", BFF],
  ["/stream", BFF],
];

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stock Trading API</title>
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/openapi.yaml",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,
      // Sends the BFF's session cookie, which /bff/callback sets, on every request.
      withCredentials: true,
      // The BFF wants this on every request that is not a read.
      requestInterceptor: (req) => {
        req.headers["X-Requested-With"] = "fetch";
        return req;
      },
    });
  </script>
</body>
</html>`;

function upstreamFor(path) {
  const match = ROUTES.find(([prefix]) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix));
  return match?.[1];
}

function proxy(req, res, upstream) {
  const target = new URL(req.url ?? "/", upstream);
  const forwardedFor = [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", ");
  const upstreamReq = httpRequest(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host, "x-forwarded-for": forwardedFor } },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
      // Close the browser side of a stream as soon as the service closes it.
      upstreamRes.on("close", () => {
        if (!res.writableEnded) res.destroy();
      });
    },
  );
  upstreamReq.on("error", (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Upstream ${upstream} unreachable: ${err.message}`, code: "PROXY_ERROR" }));
  });
  // The browser went away (e.g. closed an SSE stream): drop the upstream request too.
  res.on("close", () => {
    if (!res.writableFinished) upstreamReq.destroy();
  });
  req.pipe(upstreamReq);
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }
  if (path === "/openapi.yaml") {
    try {
      // Read on every request, so edits show up on reload.
      const spec = await readFile(SPEC_PATH);
      res.writeHead(200, { "content-type": "application/yaml; charset=utf-8", "cache-control": "no-store" });
      return res.end(spec);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      return res.end(`Cannot read ${SPEC_PATH}: ${err.message}`);
    }
  }

  const upstream = upstreamFor(path);
  if (upstream) return proxy(req, res, upstream);

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Swagger UI: http://localhost:${PORT}`);
  console.log(`Proxying /bff, /quotes, /stream → ${BFF}`);
  console.log(`Log in to the app on http://localhost:5173 first in the same browser: the session cookie is shared across ports`);
});
