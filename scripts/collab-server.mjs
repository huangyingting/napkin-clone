#!/usr/bin/env node
/**
 * Self-hosted Yjs websocket sync server for TextIQ real-time collaboration
 * (US-019).
 *
 * Hosts the shared sync logic from `collab-core.mjs` as a standalone process on
 * its own port; clients connect to `ws://host:port/<documentId>`. This is the
 * production / separate-process deployment. In local dev the same core is also
 * mounted on the Next.js server (`server.mjs`) so a single forwarded port can
 * carry both the app and collaboration.
 *
 * Run with: `npm run collab` (PORT via COLLAB_PORT, default 1234).
 *
 * This is a Ralph tooling/runtime script, not part of the Next.js bundle.
 */
import http from "node:http";

import {
  createCollabWss,
  roomCount,
  connCount,
  flushStats,
  recentFlushFailures,
} from "./collab-core.mjs";
import { createCollabAuthorizer } from "./collab-auth.mjs";
import { createEvictionFlusher } from "./collab-flush.mjs";
import { resolveDeploymentConfig } from "./collab-deployment-config.mjs";

const PORT = Number(process.env.COLLAB_PORT || 1234);
const HOST = process.env.COLLAB_HOST || "0.0.0.0";

// Resolve and validate the deployment configuration at startup.
const deploymentConfig = resolveDeploymentConfig(process.env);

if (!deploymentConfig.healthy) {
  for (const warning of deploymentConfig.warnings) {
    console.error(`[collab] FATAL CONFIG ERROR: ${warning}`);
  }
  console.error(
    "[collab] Refusing to start in a misconfigured multi-instance environment. " +
      "Fix the configuration and restart.",
  );
  process.exit(1);
}

for (const warning of deploymentConfig.warnings) {
  console.warn(`[collab] CONFIG WARNING: ${warning}`);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const summary = {
      ok: deploymentConfig.healthy,
      rooms: roomCount(),
      connections: connCount(),
      mode: deploymentConfig.mode,
      warnings: deploymentConfig.warnings,
      healthy: deploymentConfig.healthy,
      flushFailures: flushStats().flushFailures,
      recentFlushFailures: recentFlushFailures(),
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(summary));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("TextIQ collaboration server\n");
});

// Standalone: the room is the whole path (`/<documentId>`). Each upgrade is
// authenticated + authorized against the app's `/api/collab/authorize` route by
// forwarding the request cookies (issue #88). Point at the app with
// COLLAB_AUTHORIZE_URL (defaults to AUTH_URL or http://127.0.0.1:4000).
const appBaseUrl = (process.env.AUTH_URL || "http://127.0.0.1:4000").replace(
  /\/+$/,
  "",
);
const authorize = createCollabAuthorizer({
  authorizeUrl:
    process.env.COLLAB_AUTHORIZE_URL || `${appBaseUrl}/api/collab/authorize`,
});

// Flush dirty rooms to the app's internal recovery-snapshot endpoint before
// eviction (#497). Resolves against the same app origin used for authorize.
// When COLLAB_INTERNAL_SECRET is unset the flusher is a no-op (logs one
// warning), so dev without the secret still runs.
const onBeforeEvict = createEvictionFlusher({
  flushUrl: `${appBaseUrl}/api/collab/flush`,
  internalSecret: process.env.COLLAB_INTERNAL_SECRET,
});
const { handleUpgrade } = createCollabWss(undefined, {
  authorize,
  onBeforeEvict,
});
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

server.listen(PORT, HOST, () => {
  console.log(
    `[collab] Yjs websocket server listening on ws://${HOST}:${PORT} ` +
      `[mode: ${deploymentConfig.mode}]`,
  );
});
