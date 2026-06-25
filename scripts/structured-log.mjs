/**
 * Structured JSON logger for plain Node `.mjs` scripts.
 *
 * Mirrors the app logger shape (`timestamp`, `level`, `scope`, `message`) while
 * avoiding TS path aliases so collaboration scripts can import it directly.
 */
import redaction from "../src/lib/log-redaction-core.cjs";

const { redactContext } = redaction;

function safeStringify(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  if (typeof error === "string") {
    return { errorName: "Error", message: error };
  }
  return { errorName: "Error", message: safeStringify(error) };
}

function emit(writer, record) {
  try {
    writer(JSON.stringify(record));
  } catch {
    // Logging must never break runtime scripts.
  }
}

export function buildScriptLogRecord(level, scope, message, context = {}) {
  return {
    ...redactContext(context),
    level,
    scope,
    timestamp: new Date().toISOString(),
    message,
  };
}

export function buildScriptErrorLog(scope, error, context = {}) {
  const normalized = normalizeError(error);
  return {
    ...redactContext(context),
    level: "error",
    scope,
    timestamp: new Date().toISOString(),
    ...normalized,
  };
}

export function logScriptInfo(scope, message, context = {}) {
  emit(
    (line) => console.info(line),
    buildScriptLogRecord("info", scope, message, context),
  );
}

export function logScriptWarning(scope, message, context = {}) {
  emit(
    (line) => console.warn(line),
    buildScriptLogRecord("warning", scope, message, context),
  );
}

export function logScriptError(scope, error, context = {}) {
  emit(
    (line) => console.error(line),
    buildScriptErrorLog(scope, error, context),
  );
}
