import assert from "node:assert/strict";
import test from "node:test";

import {
  REDACTED,
  buildErrorLog,
  isSensitiveKey,
  logError,
  normalizeLogKey,
} from "@/lib/log";
import { buildInfoLog, logInfo } from "@/lib/log";

test("buildErrorLog redacts configured sensitive context keys", () => {
  const record = buildErrorLog("api.generate", new Error("boom"), {
    requestId: "req-1",
    reason: "generation-failed",
    text: "raw user input that must never be logged",
    payload: { text: "nested raw content" },
    input: "another raw input",
    prompt: "system prompt",
    apiKey: "sk-super-secret",
    api_key: "sk-also-secret",
    AUTH_SECRET: "top-secret",
    password: "hunter2",
    passwordHash: "$2a$12$abc",
    Authorization: "Bearer xyz",
    cookie: "session=abc",
    accessToken: "tok-123",
  });

  for (const key of [
    "text",
    "payload",
    "input",
    "prompt",
    "apiKey",
    "api_key",
    "AUTH_SECRET",
    "password",
    "passwordHash",
    "Authorization",
    "cookie",
    "accessToken",
  ]) {
    assert.equal(record[key], REDACTED, `expected ${key} to be redacted`);
  }

  // Non-sensitive correlation/diagnostic fields are preserved.
  assert.equal(record.requestId, "req-1");
  assert.equal(record.reason, "generation-failed");
});

test("buildErrorLog redacts PII-like message, stack, and generic context strings", () => {
  const error = new Error("failed for ada@example.com");
  error.stack = "Error: failed for ada@example.com\n    at x";
  const record = buildErrorLog("api.generate", error, {
    reason: "safe-code",
    emailLikeValue: "ada@example.com",
  });

  assert.equal(record.message, REDACTED);
  assert.equal(record.stack, REDACTED);
  assert.equal(record.emailLikeValue, REDACTED);
  assert.equal(record.reason, "safe-code");
});

test("buildErrorLog keeps reserved fields authoritative", () => {
  const record = buildErrorLog("my.scope", new Error("kaboom"), {
    level: "info",
    scope: "spoofed",
    message: "spoofed message",
  });

  assert.equal(record.level, "error");
  assert.equal(record.scope, "my.scope");
  assert.equal(record.message, "kaboom");
  assert.equal(record.errorName, "Error");
  assert.equal(typeof record.timestamp, "string");
});

test("buildErrorLog normalizes non-Error values", () => {
  assert.equal(buildErrorLog("s", "just a string").message, "just a string");
  assert.equal(buildErrorLog("s", { code: 7 }).message, '{"code":7}');
  assert.equal(buildErrorLog("s", "x").errorName, "Error");
});

test("buildErrorLog stringifies unserializable non-Error values safely", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  assert.equal(buildErrorLog("s", circular).message, "[object Object]");
});

test("isSensitiveKey matches secrets and raw-input keys, not safe ones", () => {
  for (const key of [
    "text",
    "input",
    "prompt",
    "apiKey",
    "api_key",
    "AUTH_SECRET",
    "password",
    "passwordHash",
    "authorization",
    "cookie",
    "refreshToken",
  ]) {
    assert.equal(isSensitiveKey(key), true, `${key} should be sensitive`);
  }
  for (const key of ["requestId", "reason", "scope", "status", "durationMs"]) {
    assert.equal(isSensitiveKey(key), false, `${key} should be safe`);
  }
});

test("normalizeLogKey strips separators and casing for shared redaction", () => {
  assert.equal(normalizeLogKey("AUTH_SECRET"), "authsecret");
  assert.equal(normalizeLogKey("api-key"), "apikey");
  assert.equal(normalizeLogKey("DeckJSON"), "deckjson");
});

test("logError emits a single JSON line with no raw newline", () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    logError("api.generate", new Error("with\nnewline\nstack"), {
      requestId: "abc",
      apiKey: "secret",
    });
  } finally {
    console.error = original;
  }

  assert.equal(lines.length, 1);
  const [line] = lines;
  assert.ok(!line.includes("\n"), "log line must not contain a raw newline");
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.level, "error");
  assert.equal(parsed.scope, "api.generate");
  assert.equal(parsed.requestId, "abc");
  assert.equal(parsed.apiKey, REDACTED);
});

test("logError swallows console serialization failures", () => {
  const original = console.error;
  console.error = () => {
    throw new Error("stderr unavailable");
  };
  try {
    assert.doesNotThrow(() => logError("api.generate", new Error("boom")));
  } finally {
    console.error = original;
  }
});

test("buildInfoLog redacts sensitive context keys and keeps counts", () => {
  const record = buildInfoLog("api.generate-deck", "deck-generated", {
    requestId: "req-9",
    slideCount: 12,
    wordsPerSlide: 18.5,
    text: "raw outline content that must never be logged",
    apiKey: "sk-secret",
  });

  assert.equal(record.level, "info");
  assert.equal(record.scope, "api.generate-deck");
  assert.equal(record.message, "deck-generated");
  assert.equal(record.requestId, "req-9");
  assert.equal(record.slideCount, 12);
  assert.equal(record.wordsPerSlide, 18.5);
  assert.equal(record.text, REDACTED);
  assert.equal(record.apiKey, REDACTED);
});

test("buildInfoLog keeps reserved fields authoritative", () => {
  const record = buildInfoLog("my.scope", "real-message", {
    level: "error",
    scope: "spoofed",
    message: "spoofed message",
  });

  assert.equal(record.level, "info");
  assert.equal(record.scope, "my.scope");
  assert.equal(record.message, "real-message");
  assert.equal(typeof record.timestamp, "string");
});

test("logInfo emits a single JSON line with no raw newline", () => {
  const original = console.info;
  const lines: string[] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    logInfo("api.generate-deck", "deck-generated", {
      requestId: "abc",
      slideCount: 5,
      apiKey: "secret",
    });
  } finally {
    console.info = original;
  }

  assert.equal(lines.length, 1);
  const [line] = lines;
  assert.ok(!line.includes("\n"), "log line must not contain a raw newline");
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.level, "info");
  assert.equal(parsed.scope, "api.generate-deck");
  assert.equal(parsed.message, "deck-generated");
  assert.equal(parsed.requestId, "abc");
  assert.equal(parsed.slideCount, 5);
  assert.equal(parsed.apiKey, REDACTED);
});

test("logInfo swallows console serialization failures", () => {
  const original = console.info;
  console.info = () => {
    throw new Error("stdout unavailable");
  };
  try {
    assert.doesNotThrow(() => logInfo("api.generate-deck", "deck-generated"));
  } finally {
    console.info = original;
  }
});
