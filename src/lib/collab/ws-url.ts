/**
 * Resolves the Yjs collaboration websocket URL for the current environment.
 *
 * Precedence:
 *  1. `NEXT_PUBLIC_COLLAB_WS_URL` — an explicit override, always wins (e.g. a
 *     standalone collab server on its own host/port).
 *  2. The page origin — the app server hosts the collaboration socket at the
 *     `/collab` path (see `server.mjs`), so we mirror the page's protocol and
 *     host (https → wss) and append `/collab`. This makes collaboration work
 *     automatically through a single forwarded port (VS Code port forwarding,
 *     tunnels, reverse proxies) with no extra configuration.
 *  3. `ws://localhost:4000/collab` — the SSR/non-browser fallback.
 *
 * The returned base URL has no room segment; callers append `/<roomId>` (the
 * `y-websocket` provider does this from its `roomname` argument).
 */
import { publicCollabWsPort, publicCollabWsUrl } from "@/lib/client-config";

const COLLAB_PATH = "/collab";

export function resolveCollabWsUrl(): string {
  const explicit = publicCollabWsUrl();
  if (explicit) {
    return explicit;
  }

  // SSR / non-browser: no origin to derive from, use a localhost default that
  // matches the app server's inline collab mount.
  if (typeof window === "undefined" || !window.location) {
    const port = publicCollabWsPort();
    return `ws://localhost:${port}${COLLAB_PATH}`;
  }

  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}${COLLAB_PATH}`;
}
