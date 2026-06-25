import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSecurityAuditLog,
  sanitizeSecurityAuditContext,
} from "@/lib/security-audit";
import { REDACTED } from "@/lib/log";

test("security audit logs allowlisted events with safe scalar context", () => {
  const record = buildSecurityAuditLog("auth.password_reset.consumed", {
    userId: "u_123",
    outcome: "success",
    count: 1,
    idempotent: true,
  });

  assert.equal(record.scope, "security.audit");
  assert.equal(record.message, "auth.password_reset.consumed");
  assert.equal(record.event, "auth.password_reset.consumed");
  assert.equal(record.userId, "u_123");
  assert.equal(record.count, 1);
  assert.equal(record.idempotent, true);
});

test("security audit redacts secrets, tokens, emails, URLs, card-like values, and non-scalars", () => {
  const context = sanitizeSecurityAuditContext({
    email: "ada@example.com",
    token: "a".repeat(43),
    password: "hunter2",
    callbackUrl: "https://example.com/callback?token=secret",
    stripeSignature: "whsec_secret",
    prompt: "raw prompt",
    cardLastFull: "4242 4242 4242 4242",
    nested: { unsafe: true },
    userId: "u_123",
    reason: "used",
  });

  for (const key of [
    "email",
    "token",
    "password",
    "callbackUrl",
    "stripeSignature",
    "prompt",
    "cardLastFull",
    "nested",
  ]) {
    assert.equal(context[key], REDACTED, `${key} should be redacted`);
  }
  assert.equal(context.userId, "u_123");
  assert.equal(context.reason, "used");
});
