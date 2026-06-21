/**
 * Pure deployment configuration decision module for the TextIQ collaboration
 * server.
 *
 * Given a subset of environment variables, produces an explicit mode declaration,
 * human-readable warnings, and a `healthy` flag. The logic is free of I/O and
 * side-effects so it can be exercised directly by node:test.
 *
 * The plain-ESM mirror (`scripts/collab-deployment-config.mjs`) replicates this
 * logic for the server scripts that run as plain Node.js without tsx.
 */

type CollabDeploymentMode = "single-instance" | "unconfigured";

export interface CollabDeploymentConfig {
  /** Explicitly declared mode, or 'unconfigured' if no declaration was made. */
  mode: CollabDeploymentMode;
  /** Human-readable warnings about the current configuration. */
  warnings: string[];
  /**
   * False when the configuration is actively harmful — e.g. multiple instances
   * detected without sticky routing, which causes silent edit divergence.
   */
  healthy: boolean;
}

/** The subset of process.env consumed by the config module. */
export interface CollabEnv {
  COLLAB_SINGLE_INSTANCE?: string;
  COLLAB_INSTANCE_COUNT?: string;
  COLLAB_STICKY_ROUTING?: string;
}

/**
 * Derives the collaboration deployment configuration from environment variables.
 * Pure: no I/O, no side-effects, fully testable.
 *
 * Decision matrix:
 * - `COLLAB_SINGLE_INSTANCE=1|true`                     → single-instance, healthy, no warnings
 * - `COLLAB_INSTANCE_COUNT>1` + no sticky routing       → unconfigured, unhealthy, divergence warning
 * - `COLLAB_INSTANCE_COUNT>1` + `COLLAB_STICKY_ROUTING=1|true` → unconfigured, healthy, no warnings
 * - Default (nothing set / COLLAB_INSTANCE_COUNT<=1)    → unconfigured, healthy, soft advisory
 */
export function resolveDeploymentConfig(
  env: CollabEnv = {},
): CollabDeploymentConfig {
  const singleInstance =
    env.COLLAB_SINGLE_INSTANCE === "1" || env.COLLAB_SINGLE_INSTANCE === "true";
  const instanceCount = Math.max(
    1,
    parseInt(env.COLLAB_INSTANCE_COUNT ?? "1", 10) || 1,
  );
  const stickyRouting =
    env.COLLAB_STICKY_ROUTING === "1" || env.COLLAB_STICKY_ROUTING === "true";

  // Explicitly declared single-instance: clean bill of health.
  if (singleInstance) {
    return { mode: "single-instance", warnings: [], healthy: true };
  }

  // Multi-instance without sticky routing: edits diverge silently → unhealthy.
  if (instanceCount > 1 && !stickyRouting) {
    return {
      mode: "unconfigured",
      warnings: [
        `COLLAB_INSTANCE_COUNT=${instanceCount} is set without COLLAB_STICKY_ROUTING=1. ` +
          "Clients on different instances will not converge — they will each see a private " +
          "in-memory room and edits will silently diverge. Either enable sticky routing at " +
          "your load balancer and set COLLAB_STICKY_ROUTING=1, or run a single instance " +
          "and set COLLAB_SINGLE_INSTANCE=1.",
      ],
      healthy: false,
    };
  }

  // Multi-instance with sticky routing: explicitly configured and healthy.
  if (instanceCount > 1 && stickyRouting) {
    return { mode: "unconfigured", warnings: [], healthy: true };
  }

  // Default: single instance implicitly, but the operator has not declared that
  // intent. Surface a soft advisory; the server is still healthy.
  return {
    mode: "unconfigured",
    warnings: [
      "COLLAB_SINGLE_INSTANCE is not set. Set COLLAB_SINGLE_INSTANCE=1 to explicitly " +
        "declare single-instance mode and silence this warning. Running without this " +
        "flag is safe for a single instance but will produce this advisory on every start.",
    ],
    healthy: true,
  };
}

/** Runtime statistics collected from the running server. */
export interface CollabRuntimeStats {
  rooms: number;
  connections: number;
}

/** Full health summary returned by the `/health` endpoint. */
export interface CollabHealthSummary {
  ok: boolean;
  rooms: number;
  connections: number;
  mode: CollabDeploymentMode;
  warnings: string[];
  healthy: boolean;
}

/**
 * Combines live runtime statistics with the deployment configuration into a
 * single health-summary object suitable for serialising as JSON in `/health`.
 */
export function buildHealthSummary(
  stats: CollabRuntimeStats,
  config: CollabDeploymentConfig,
): CollabHealthSummary {
  return {
    ok: config.healthy,
    rooms: stats.rooms,
    connections: stats.connections,
    mode: config.mode,
    warnings: config.warnings,
    healthy: config.healthy,
  };
}
