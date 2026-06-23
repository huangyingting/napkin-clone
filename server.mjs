#!/usr/bin/env node
/**
 * Custom Next.js server that also hosts the Yjs collaboration websocket
 * (US-019) on the *same* port at the `/collab` path. Serving collaboration
 * through the app origin means a single forwarded port (e.g. VS Code port
 * forwarding, a tunnel, or a single reverse-proxy host) carries both the app
 * and the realtime socket, so the browser derives the websocket URL from the
 * page origin (`resolveCollabWsUrl`) and collaboration works automatically with
 * no extra port to forward or configure.
 *
 * Non-`/collab` upgrade requests (Next's HMR websocket in dev) are forwarded to
 * Next's own upgrade handler. The standalone `scripts/collab-server.mjs` remains
 * for deployments that prefer a separate collaboration process.
 *
 * Used by `npm run dev` and `npm start`. Set `COLLAB_INLINE=0` to disable the
 * inline collab socket (e.g. when running the standalone server instead).
 */
import { createServer } from "node:http";
import { parse } from "node:url";

import next from "next";

import {
  createCollabWss,
  roomCount,
  connCount,
  flushStats,
  recentFlushFailures,
} from "./scripts/collab-core.mjs";
import { createCollabAuthorizer } from "./scripts/collab-auth.mjs";
import { createEvictionFlusher } from "./scripts/collab-flush.mjs";
import { resolveDeploymentConfig } from "./scripts/collab-deployment-config.mjs";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 4000);
const hostname = process.env.HOST || "0.0.0.0";
const inlineCollab = process.env.COLLAB_INLINE !== "0";
const COLLAB_PATH = "/collab";

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

const app = next({ dev, hostname, port, turbopack: dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  // Health endpoint for the inline collab socket.
  if (req.url === `${COLLAB_PATH}/health`) {
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
  const parsedUrl = parse(req.url || "/", true);
  handle(req, res, parsedUrl);
});

if (inlineCollab) {
  // Authenticate + authorize each upgrade against the app's permission rules by
  // forwarding the request cookies to the `/api/collab/authorize` route on this
  // same server (issue #88). Unauthenticated/forbidden upgrades are refused.
  const authorize = createCollabAuthorizer({
    authorizeUrl: `http://127.0.0.1:${port}/api/collab/authorize`,
  });

  // Flush dirty rooms to the internal recovery-snapshot endpoint before
  // eviction (#497). Resolves against this same server's app origin. When
  // COLLAB_INTERNAL_SECRET is unset the flusher is a no-op (logs one warning),
  // so dev without the secret still runs.
  const onBeforeEvict = createEvictionFlusher({
    flushUrl: `http://127.0.0.1:${port}/api/collab/flush`,
    internalSecret: process.env.COLLAB_INTERNAL_SECRET,
  });

  // Room name is the path after `/collab/` (`/collab/<documentId>`).
  const { handleUpgrade: handleCollabUpgrade } = createCollabWss(
    (url) => {
      const pathname = (url || "/").split("?")[0];
      const room = pathname.slice(COLLAB_PATH.length).replace(/^\/+/, "");
      return room || "default";
    },
    { authorize, onBeforeEvict },
  );

  const handleNextUpgrade = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "/");
    if (pathname === COLLAB_PATH || pathname?.startsWith(`${COLLAB_PATH}/`)) {
      handleCollabUpgrade(req, socket, head);
      return;
    }
    // Everything else (Next.js HMR in dev) goes to Next.
    void handleNextUpgrade(req, socket, head);
  });
}

server.listen(port, hostname, () => {
  console.log(`▲ Ready on http://${hostname}:${port}`);
  if (inlineCollab) {
    console.log(
      `[collab] inline Yjs websocket mounted at ${COLLAB_PATH} ` +
        `[mode: ${deploymentConfig.mode}]`,
    );
  }
});
