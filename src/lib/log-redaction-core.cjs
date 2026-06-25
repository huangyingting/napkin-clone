"use strict";

const REDACTED = "[redacted]";

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

const CONTENT_KEYS = new Set([
  "deckjson",
  "contentjson",
  "data",
  "visual",
  "deck",
  "node",
  "payload",
  "raw",
  "rawdeck",
  "rawvisual",
  "value",
  "snapshot",
  "body",
]);

function normalizeLogKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key) {
  const normalized = normalizeLogKey(key);
  if (SENSITIVE_EXACT.has(normalized)) {
    return true;
  }
  return SENSITIVE_SUBSTRINGS.some((part) => normalized.includes(part));
}

function isContentKey(key) {
  return CONTENT_KEYS.has(normalizeLogKey(key));
}

function redactContext(context = {}) {
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return out;
}

function isSafeTelemetryScalar(value) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function buildSafeTelemetryContext(context = {}) {
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    if (isContentKey(key)) continue;
    if (!isSafeTelemetryScalar(value)) continue;
    out[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return out;
}

module.exports = {
  REDACTED,
  normalizeLogKey,
  isSensitiveKey,
  isContentKey,
  redactContext,
  isSafeTelemetryScalar,
  buildSafeTelemetryContext,
};
