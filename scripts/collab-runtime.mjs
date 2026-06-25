/**
 * Runtime assembly helpers for the plain-Node collaboration entry points.
 *
 * This module owns deployment diagnostics, health summaries, service URL
 * resolution, authorizer/flusher construction, and room-name rules. It stays in
 * `.mjs` so `server.mjs` and `scripts/collab-server.mjs` can share it without
 * importing the TypeScript Auth/Prisma app boundary.
 */
import { createCollabAuthorizer } from "./collab-auth.mjs";
import { resolveDeploymentConfig } from "./collab-deployment-config.mjs";
import { createEvictionFlusher } from "./collab-flush.mjs";
import { logScriptError, logScriptWarning } from "./structured-log.mjs";

export const COLLAB_INLINE_PATH = "/collab";

const DEFAULT_APP_BASE_URL = "http://127.0.0.1:4000";

const trimTrailingSlashes = (value) => String(value).replace(/\/+$/, "");

/**
 * @typedef {'inline'|'standalone'} CollabRuntimeMode
 * @typedef {{
 *   ok: boolean,
 *   rooms: number,
 *   connections: number,
 *   mode: 'single-instance'|'unconfigured',
 *   warnings: string[],
 *   healthy: boolean,
 *   flushFailures: number,
 *   recentFlushFailures: Array<{ room: string, docId: string, reason: string, at: string }>,
 * }} CollabHealthSummary
 */

/**
 * Resolves and validates deployment mode from environment variables.
 *
 * @param {Record<string, string|undefined>} env
 */
export function resolveCollabDeployment(env = {}) {
  return resolveDeploymentConfig(env);
}

/**
 * Emits deployment warnings/fatal diagnostics in the entry point's existing
 * shape. Returns `false` when the caller must fail closed and stop startup.
 *
 * @param {{ mode: string, warnings: string[], healthy: boolean }} deploymentConfig
 * @param {{
 *   runtimeMode: CollabRuntimeMode,
 *   scope?: string,
 *   writeInlineWarning?: (line: string) => void,
 *   writeInlineError?: (line: string) => void,
 * }} options
 * @returns {boolean}
 */
export function emitDeploymentDiagnostics(deploymentConfig, options) {
  const runtimeMode = options.runtimeMode;
  const scope = options.scope || "collab.server.configure";
  const writeInlineWarning = options.writeInlineWarning || (() => {});
  const writeInlineError = options.writeInlineError || (() => {});

  if (!deploymentConfig.healthy) {
    if (runtimeMode === "inline") {
      for (const warning of deploymentConfig.warnings) {
        writeInlineError(`[collab] FATAL CONFIG ERROR: ${warning}`);
      }
      writeInlineError(
        "[collab] Refusing to start in a misconfigured multi-instance environment. " +
          "Fix the configuration and restart.",
      );
    } else {
      for (const warning of deploymentConfig.warnings) {
        logScriptError(scope, new Error(warning), {
          mode: deploymentConfig.mode,
        });
      }
      logScriptError(
        scope,
        new Error("refusing to start in a misconfigured environment"),
        { mode: deploymentConfig.mode },
      );
    }
    return false;
  }

  for (const warning of deploymentConfig.warnings) {
    if (runtimeMode === "inline") {
      writeInlineWarning(`[collab] CONFIG WARNING: ${warning}`);
    } else {
      logScriptWarning(scope, "configuration warning", {
        mode: deploymentConfig.mode,
        warning,
      });
    }
  }

  return true;
}

/**
 * Combines live runtime counters and deployment config into the JSON health
 * payload returned by both inline and standalone collaboration endpoints.
 *
 * @param {{
 *   deploymentConfig: { mode: 'single-instance'|'unconfigured', warnings: string[], healthy: boolean },
 *   rooms: number,
 *   connections: number,
 *   flushFailures: number,
 *   recentFlushFailures: Array<{ room: string, docId: string, reason: string, at: string }>,
 * }} input
 * @returns {CollabHealthSummary}
 */
export function buildCollabHealthSummary(input) {
  return {
    ok: input.deploymentConfig.healthy,
    rooms: input.rooms,
    connections: input.connections,
    mode: input.deploymentConfig.mode,
    warnings: input.deploymentConfig.warnings,
    healthy: input.deploymentConfig.healthy,
    flushFailures: input.flushFailures,
    recentFlushFailures: input.recentFlushFailures,
  };
}

/**
 * Resolves the app base URL and internal service endpoints used by the collab
 * runtime. Inline mode always points at its own HTTP server to preserve existing
 * cookie forwarding and internal-flush behavior; standalone mode points at
 * AUTH_URL or the historical localhost default.
 *
 * @param {{ runtimeMode: CollabRuntimeMode, env?: Record<string, string|undefined>, port?: number }} options
 */
export function resolveCollabServiceUrls(options) {
  const env = options.env || {};

  if (options.runtimeMode === "inline") {
    const port = Number(options.port || env.PORT || 4000);
    const appBaseUrl = `http://127.0.0.1:${port}`;
    return {
      appBaseUrl,
      authorizeUrl: `${appBaseUrl}/api/collab/authorize`,
      flushUrl: `${appBaseUrl}/api/collab/flush`,
    };
  }

  const appBaseUrl = trimTrailingSlashes(env.AUTH_URL || DEFAULT_APP_BASE_URL);
  return {
    appBaseUrl,
    authorizeUrl:
      env.COLLAB_AUTHORIZE_URL || `${appBaseUrl}/api/collab/authorize`,
    flushUrl: `${appBaseUrl}/api/collab/flush`,
  };
}

/**
 * Keeps COLLAB_INTERNAL_SECRET resolution centralized without changing its
 * value. The flusher remains a no-op-with-warning when this is falsy; the API
 * endpoint remains fail-closed independently.
 *
 * @param {Record<string, string|undefined>} env
 */
export function resolveCollabInternalSecret(env = {}) {
  return env.COLLAB_INTERNAL_SECRET;
}

/**
 * @param {{ runtimeMode: CollabRuntimeMode, env?: Record<string, string|undefined>, port?: number, fetchImpl?: typeof fetch }} options
 */
export function createRuntimeAuthorizer(options) {
  const urls = resolveCollabServiceUrls(options);
  return createCollabAuthorizer({
    authorizeUrl: urls.authorizeUrl,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.env?.COLLAB_AUTHORIZE_TIMEOUT_MS,
  });
}

/**
 * @param {{ runtimeMode: CollabRuntimeMode, env?: Record<string, string|undefined>, port?: number, fetchImpl?: typeof fetch }} options
 */
export function createRuntimeEvictionFlusher(options) {
  const env = options.env || {};
  const urls = resolveCollabServiceUrls(options);
  return createEvictionFlusher({
    flushUrl: urls.flushUrl,
    internalSecret: resolveCollabInternalSecret(env),
    fetchImpl: options.fetchImpl,
  });
}

/**
 * Inline room names are the path segment after `/collab/`.
 *
 * @param {string|undefined} url
 * @param {string} [collabPath]
 */
export function roomFromInlineUrl(url, collabPath = COLLAB_INLINE_PATH) {
  const pathname = (url || "/").split("?")[0];
  const room = pathname.slice(collabPath.length).replace(/^\/+/, "");
  return room || "default";
}

/**
 * Standalone room names are the full root path after the first slash.
 *
 * @param {string|undefined} url
 */
export function roomFromStandaloneUrl(url) {
  return (url || "/").slice(1).split("?")[0] || "default";
}
