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

import { createCollabWss, roomCount } from "./collab-core.mjs";

const PORT = Number(process.env.COLLAB_PORT || 1234);
const HOST = process.env.COLLAB_HOST || "0.0.0.0";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("TextIQ collaboration server\n");
});

// Standalone: the room is the whole path (`/<documentId>`).
const { handleUpgrade } = createCollabWss();
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

server.listen(PORT, HOST, () => {
  console.log(
    `[collab] Yjs websocket server listening on ws://${HOST}:${PORT}`,
  );
});
