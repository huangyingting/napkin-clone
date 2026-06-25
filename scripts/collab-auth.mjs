/**
 * Authentication + authorization for the collaboration WebSocket upgrade
 * (issue #88).
 *
 * `server.mjs` / `scripts/collab-server.mjs` run under plain Node and cannot
 * import the TypeScript Auth.js / Prisma stack, so this module authorizes a room
 * join by forwarding the upgrade request's cookies to the app's
 * `/api/collab/authorize` route (which reuses the shared session + role-aware
 * permission helpers). The route is the single source of truth for the
 * owner/editor/viewer/none rules; this module only translates its HTTP response
 * into an upgrade decision.
 *
 * The check fails closed: any error, non-2xx status, or malformed response
 * refuses the upgrade so a transient outage can never silently grant access.
 */
import { logScriptError } from "./structured-log.mjs";

const DEFAULT_AUTHORIZE_TIMEOUT_MS = 5000;

const readPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * @typedef {Object} CollabUpgradeDecision
 * @property {boolean} ok        Whether the upgrade should proceed.
 * @property {number}  status    HTTP-style status (101 ok, 401/403 refused).
 * @property {boolean} [readOnly] When ok, true for viewers (writes dropped).
 */

/**
 * Translates the `/api/collab/authorize` response into an upgrade decision.
 * Exported for unit testing; pure given a `status` and parsed JSON body.
 *
 * @param {number} status
 * @param {unknown} body
 * @returns {CollabUpgradeDecision}
 */
export function interpretAuthorizeResponse(status, body) {
  if (status === 200 && body && typeof body === "object" && body.ok) {
    return { ok: true, status: 101, readOnly: Boolean(body.readOnly) };
  }
  if (status === 401) {
    return { ok: false, status: 401 };
  }
  // Treat every other outcome (403, 404, 5xx, malformed) as forbidden.
  return { ok: false, status: 403 };
}

/**
 * Builds an authorizer for {@link createCollabWss}. The returned function takes
 * the upgrade request and the resolved room name and resolves to a
 * {@link CollabUpgradeDecision}.
 *
 * @param {Object} [options]
 * @param {string} options.authorizeUrl Base URL of the app's authorize route,
 *   e.g. `http://127.0.0.1:4000/api/collab/authorize`.
 * @param {typeof fetch} [options.fetchImpl] Override for testing.
 * @param {number} [options.timeoutMs] Authorization request timeout.
 */
export function createCollabAuthorizer(options = {}) {
  const authorizeUrl = options.authorizeUrl;
  if (!authorizeUrl) {
    throw new Error("[collab] createCollabAuthorizer requires authorizeUrl");
  }
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = readPositiveInt(
    options.timeoutMs ?? process.env.COLLAB_AUTHORIZE_TIMEOUT_MS,
    DEFAULT_AUTHORIZE_TIMEOUT_MS,
  );

  return async function authorize(req, room) {
    if (!room || room === "default") {
      // No concrete document id ⇒ nothing to authorize against.
      return { ok: false, status: 403 };
    }

    const url = `${authorizeUrl}?room=${encodeURIComponent(room)}`;
    const cookie = req.headers?.cookie;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);
    timeout.unref?.();

    try {
      const res = await fetchImpl(url, {
        headers: {
          // Forward the browser's session cookie so the route can authenticate.
          ...(cookie ? { cookie } : {}),
          accept: "application/json",
        },
        signal: abortController.signal,
      });

      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      return interpretAuthorizeResponse(res.status, body);
    } catch (err) {
      logScriptError("collab.auth.request", err, { room });
      return { ok: false, status: 403 };
    } finally {
      clearTimeout(timeout);
    }
  };
}
