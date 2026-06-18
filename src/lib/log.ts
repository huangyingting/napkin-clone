/**
 * Minimal structured error logging (US-019).
 *
 * `logError` emits exactly ONE JSON line to `stderr` (via `console.error`) so
 * logs aggregate cleanly in production log pipelines. It is deliberately
 * PII-aware: callers must never pass raw user input text or secrets in
 * `context`, and as a safety net any context key that looks sensitive (api
 * keys, tokens, cookies, passwords, the AUTH_SECRET, raw input/prompt text) is
 * redacted before the line is written.
 *
 * The module is framework-free (only `console`) so it is safe server-side and
 * unit-testable via {@link buildErrorLog}, which builds the record without
 * writing anything.
 */

/** Replacement value written in place of a redacted sensitive context value. */
export const REDACTED = "[redacted]";

/**
 * Normalized substrings that mark a context key as sensitive. A key is matched
 * after lower-casing and stripping non-alphanumerics, so `AUTH_SECRET`,
 * `api_key`, and `Authorization` all match.
 */
const SENSITIVE_SUBSTRINGS = [
  "secret",
  "password",
  "passwd",
  "token",
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "privatekey",
];

/** Normalized keys that hold raw user input and must never be logged. */
const SENSITIVE_EXACT = new Set([
  "text",
  "input",
  "inputtext",
  "rawtext",
  "usertext",
  "prompt",
  "messages",
  "key",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when a context key should be redacted before logging. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_EXACT.has(normalized)) {
    return true;
  }
  return SENSITIVE_SUBSTRINGS.some((part) => normalized.includes(part));
}

function redactContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return out;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { name: "Error", message: error };
  }
  return { name: "Error", message: safeStringify(error) };
}

export interface ErrorLogRecord {
  level: "error";
  scope: string;
  timestamp: string;
  errorName: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
}

/**
 * Build the structured error record (redacting sensitive context keys) WITHOUT
 * writing it. Exposed for unit tests; production code should call
 * {@link logError}.
 *
 * Reserved fields (`level`, `scope`, `timestamp`, `errorName`, `message`,
 * `stack`) always win over context keys, so a caller cannot clobber them.
 */
export function buildErrorLog(
  scope: string,
  error: unknown,
  context: Record<string, unknown> = {},
): ErrorLogRecord {
  const { name, message, stack } = normalizeError(error);
  return {
    ...redactContext(context),
    level: "error",
    scope,
    timestamp: new Date().toISOString(),
    errorName: name,
    message,
    ...(stack ? { stack } : {}),
  };
}

/**
 * Emit a single structured JSON error line to `stderr`. Sensitive context keys
 * are redacted. Never throws (logging must not break request handling).
 */
export function logError(
  scope: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  try {
    console.error(JSON.stringify(buildErrorLog(scope, error, context)));
  } catch {
    // Logging must never break the caller.
  }
}
