/**
 * Structured error-code taxonomy for TextIQ (issue #460).
 *
 * Error codes are STABLE identifiers — they are part of the structured-log
 * API and must not be renamed or removed. UI layers can translate them; logs
 * and downstream pipelines depend on them being consistent across deployments.
 *
 * Design principles:
 *  - Layered on top of {@link buildErrorLog}/{@link logError} from
 *    `src/lib/log.ts` — existing log behavior is unchanged.
 *  - Codes are `SCREAMING_SNAKE_CASE` strings grouped by domain prefix.
 *  - Each {@link DiagnosticRecord} carries a code, severity, a scope (new/touched
 *    scopes use `area.subsystem.operation`), and safe metadata (ids/counts only —
 *    no PII or raw document content).
 *  - Three severities: `"fatal"` (operation cannot complete), `"error"`
 *    (operation failed but may retry), `"warning"` (partial degradation).
 *
 * ## Code taxonomy
 *
 * | Code                      | Domain    | Severity | User-facing? |
 * |---------------------------|-----------|----------|--------------|
 * | SAVE_CONFLICT             | save      | error    | Yes          |
 * | SAVE_OVERSIZED            | save      | error    | Yes          |
 * | SAVE_FAILED               | save      | error    | Yes          |
 * | INVALID_DECK              | deck      | error    | Dev/log      |
 * | INVALID_VISUAL            | visual    | error    | Dev/log      |
 * | PROJECTION_REPAIR_FAILED  | visual    | error    | Dev/log      |
 * | PERMISSION_DENIED         | auth      | error    | Yes          |
 * | MISSING_ASSET             | asset     | error    | Yes          |
 * | EXPORT_FALLBACK           | export    | warning  | Yes          |
 * | EXPORT_PREFLIGHT_FATAL    | export    | fatal    | Yes          |
 * | SOURCE_STALE              | source    | warning  | Yes          |
 * | SOURCE_MISSING            | source    | error    | Yes          |
 * | UNSUPPORTED_COMMAND       | command   | error    | Dev/log      |
 * | BUDGET_EXCEEDED           | budget    | warning  | Dev/log      |
 */

import { buildErrorLog, logError, type ErrorLogRecord } from "@/lib/log";

// ---------------------------------------------------------------------------
// Code constants — STABLE API; do NOT rename
// ---------------------------------------------------------------------------

/** All structured diagnostic codes used across the system. */
export const ERROR_CODES = {
  // Save / persistence
  SAVE_CONFLICT: "SAVE_CONFLICT",
  SAVE_OVERSIZED: "SAVE_OVERSIZED",
  SAVE_FAILED: "SAVE_FAILED",

  // Deck / schema
  INVALID_DECK: "INVALID_DECK",

  // Visual / projection
  INVALID_VISUAL: "INVALID_VISUAL",
  PROJECTION_REPAIR_FAILED: "PROJECTION_REPAIR_FAILED",

  // Authorization
  PERMISSION_DENIED: "PERMISSION_DENIED",

  // Assets
  MISSING_ASSET: "MISSING_ASSET",

  // Export
  EXPORT_FALLBACK: "EXPORT_FALLBACK",
  EXPORT_PREFLIGHT_FATAL: "EXPORT_PREFLIGHT_FATAL",

  // Source links
  SOURCE_STALE: "SOURCE_STALE",
  SOURCE_MISSING: "SOURCE_MISSING",

  // Command envelope
  UNSUPPORTED_COMMAND: "UNSUPPORTED_COMMAND",

  // Performance / budget
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

/** Severity tier for a diagnostic. */
export type DiagnosticSeverity = "fatal" | "error" | "warning";

/**
 * Canonical severity for each error code. Used to build {@link DiagnosticRecord}
 * without requiring callers to specify severity every time.
 */
export const CODE_SEVERITY: Record<ErrorCode, DiagnosticSeverity> = {
  SAVE_CONFLICT: "error",
  SAVE_OVERSIZED: "error",
  SAVE_FAILED: "error",
  INVALID_DECK: "error",
  INVALID_VISUAL: "error",
  PROJECTION_REPAIR_FAILED: "error",
  PERMISSION_DENIED: "error",
  MISSING_ASSET: "error",
  EXPORT_FALLBACK: "warning",
  EXPORT_PREFLIGHT_FATAL: "fatal",
  SOURCE_STALE: "warning",
  SOURCE_MISSING: "error",
  UNSUPPORTED_COMMAND: "error",
  BUDGET_EXCEEDED: "warning",
};

// ---------------------------------------------------------------------------
// Structured diagnostic record
// ---------------------------------------------------------------------------

/**
 * A structured diagnostic record. Safe metadata only — ids/counts/codes, no
 * raw document content or PII.
 */
export interface DiagnosticRecord {
  /** Stable error code. */
  code: ErrorCode;
  /** Severity tier. */
  severity: DiagnosticSeverity;
  /** The scope / subsystem that emitted the diagnostic (e.g. "command.validation.unsupported"). */
  scope: string;
  /** Human-readable description (English, developer-facing). */
  message: string;
  /** Safe structured metadata: ids, counts, tokens — never raw content. */
  meta: Record<string, unknown>;
}

/**
 * Build a {@link DiagnosticRecord} for the given code, automatically deriving
 * the severity from {@link CODE_SEVERITY}.
 *
 * @param code  - Stable error code.
 * @param scope - Subsystem that emitted the diagnostic.
 * @param message - Human-readable description (developer-facing).
 * @param meta  - Safe metadata: ids/counts/tokens only.
 */
export function buildDiagnostic(
  code: ErrorCode,
  scope: string,
  message: string,
  meta: Record<string, unknown> = {},
): DiagnosticRecord {
  return {
    code,
    severity: CODE_SEVERITY[code],
    scope,
    message,
    meta,
  };
}

/**
 * Build a structured error log record that merges a {@link DiagnosticRecord}
 * with the base {@link ErrorLogRecord} shape from `log.ts`. The `code` field
 * is injected alongside the standard fields so log pipelines can filter by code
 * without parsing the free-text `message`.
 */
export function buildDiagnosticErrorLog(
  diagnostic: DiagnosticRecord,
  error?: unknown,
): ErrorLogRecord & { code: ErrorCode; severity: DiagnosticSeverity } {
  const base = buildErrorLog(
    diagnostic.scope,
    error ?? new Error(diagnostic.message),
    { code: diagnostic.code, ...diagnostic.meta },
  );
  return {
    ...base,
    code: diagnostic.code,
    severity: diagnostic.severity,
  };
}

/**
 * Emit a structured JSON error line to `stderr` enriched with the diagnostic
 * code. Wraps {@link logError} — existing behavior is unchanged.
 */
export function logDiagnostic(
  diagnostic: DiagnosticRecord,
  error?: unknown,
): void {
  logError(diagnostic.scope, error ?? new Error(diagnostic.message), {
    code: diagnostic.code,
    severity: diagnostic.severity,
    ...diagnostic.meta,
  });
}

// ---------------------------------------------------------------------------
// Convenience builders for the highest-traffic code paths
// ---------------------------------------------------------------------------

/** Build a SAVE_CONFLICT diagnostic. */
export function saveDiagnosticConflict(
  documentId: string,
  meta: Record<string, unknown> = {},
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.SAVE_CONFLICT,
    "save.deck",
    "Deck revision token mismatch — concurrent write detected.",
    { documentId, ...meta },
  );
}

/** Build a SAVE_OVERSIZED diagnostic. */
export function saveDiagnosticOversized(
  documentId: string,
  actualBytes: number,
  maxBytes: number,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.SAVE_OVERSIZED,
    "save.deck",
    "Deck JSON exceeds size limit.",
    { documentId, actualBytes, maxBytes },
  );
}

/** Build an INVALID_DECK diagnostic. */
export function deckDiagnosticInvalid(
  documentId: string,
  meta: Record<string, unknown> = {},
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.INVALID_DECK,
    "save.deck",
    "Deck JSON failed schema validation.",
    { documentId, ...meta },
  );
}

/** Build a PERMISSION_DENIED diagnostic. */
export function authDiagnosticDenied(
  userId: string,
  documentId: string,
  capability: string,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.PERMISSION_DENIED,
    "auth.document",
    "User lacks required capability.",
    { userId, documentId, capability },
  );
}

/** Build an INVALID_VISUAL diagnostic. */
export function visualDiagnosticInvalid(
  documentId: string,
  anchorBlockId: string,
  visualType: string,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.INVALID_VISUAL,
    "visual.mirror",
    "Visual payload failed schema validation.",
    { documentId, anchorBlockId, visualType },
  );
}

/** Build a PROJECTION_REPAIR_FAILED diagnostic. */
export function projectionDiagnosticFailed(
  documentId: string,
  meta: Record<string, unknown> = {},
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.PROJECTION_REPAIR_FAILED,
    "visual.rebuild",
    "Visual mirror rebuild failed.",
    { documentId, ...meta },
  );
}

/** Build an EXPORT_PREFLIGHT_FATAL diagnostic. */
export function exportDiagnosticFatal(
  documentId: string,
  fatalCount: number,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.EXPORT_PREFLIGHT_FATAL,
    "export.preflight",
    "Export preflight found fatal errors.",
    { documentId, fatalCount },
  );
}

/** Build an EXPORT_FALLBACK diagnostic. */
export function exportDiagnosticFallback(
  documentId: string,
  warningCount: number,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.EXPORT_FALLBACK,
    "export.preflight",
    "Export will use fallback rendering for one or more elements.",
    { documentId, warningCount },
  );
}

/** Build a MISSING_ASSET diagnostic. */
export function assetDiagnosticMissing(
  documentId: string,
  elementId: string,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.MISSING_ASSET,
    "asset",
    "Image element references a missing or unresolvable asset.",
    { documentId, elementId },
  );
}

/** Build an UNSUPPORTED_COMMAND diagnostic. */
export function commandDiagnosticUnsupported(
  op: string,
  meta: Record<string, unknown> = {},
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.UNSUPPORTED_COMMAND,
    "command.validation.unsupported",
    `Command op '${op}' is not supported.`,
    { op, ...meta },
  );
}

/** Build a BUDGET_EXCEEDED diagnostic. */
export function budgetDiagnosticExceeded(
  scope: string,
  metric: string,
  actual: number,
  budget: number,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.BUDGET_EXCEEDED,
    scope,
    `Performance budget exceeded for ${metric}.`,
    { metric, actual, budget },
  );
}
