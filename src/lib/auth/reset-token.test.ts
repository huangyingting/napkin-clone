import assert from "node:assert/strict";
import test from "node:test";

import {
  RESET_TOKEN_REJECTION_MESSAGE,
  RESET_TOKEN_TTL_MS,
  evaluateResetToken,
  generateResetToken,
  hashResetToken,
} from "@/lib/auth/reset-token";

const NOW = new Date("2026-06-21T09:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + RESET_TOKEN_TTL_MS);
const PAST = new Date(NOW.getTime() - 1);

test("accepts a token that exists, is unused, and has not expired", () => {
  const result = evaluateResetToken({
    exists: true,
    expiresAt: FUTURE,
    usedAt: null,
    now: NOW,
  });
  assert.deepEqual(result, { valid: true });
});

test("rejects a token that does not exist as not_found", () => {
  const result = evaluateResetToken({
    exists: false,
    expiresAt: null,
    usedAt: null,
    now: NOW,
  });
  assert.deepEqual(result, { valid: false, reason: "not_found" });
});

test("rejects an already-used token as used", () => {
  const result = evaluateResetToken({
    exists: true,
    expiresAt: FUTURE,
    usedAt: new Date(NOW.getTime() - 5000),
    now: NOW,
  });
  assert.deepEqual(result, { valid: false, reason: "used" });
});

test("rejects an expired token as expired", () => {
  const result = evaluateResetToken({
    exists: true,
    expiresAt: PAST,
    usedAt: null,
    now: NOW,
  });
  assert.deepEqual(result, { valid: false, reason: "expired" });
});

test("treats expiry as exclusive — exactly at expiresAt is expired", () => {
  const result = evaluateResetToken({
    exists: true,
    expiresAt: NOW,
    usedAt: null,
    now: NOW,
  });
  assert.deepEqual(result, { valid: false, reason: "expired" });
});

test("the used check runs before the expiry check", () => {
  // A token that is both used AND expired reports `used`: it was already spent,
  // which is the more specific fact for the user.
  const result = evaluateResetToken({
    exists: true,
    expiresAt: PAST,
    usedAt: new Date(NOW.getTime() - 5000),
    now: NOW,
  });
  assert.deepEqual(result, { valid: false, reason: "used" });
});

test("every rejection reason has user-facing copy", () => {
  for (const reason of ["not_found", "used", "expired"] as const) {
    assert.equal(typeof RESET_TOKEN_REJECTION_MESSAGE[reason], "string");
    assert.ok(RESET_TOKEN_REJECTION_MESSAGE[reason].length > 0);
  }
});

test("hashResetToken is deterministic and never returns the raw token", () => {
  const raw = "a-known-raw-token";
  const first = hashResetToken(raw);
  const second = hashResetToken(raw);
  assert.equal(first, second);
  assert.notEqual(first, raw);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("hashResetToken maps different tokens to different hashes", () => {
  assert.notEqual(hashResetToken("token-one"), hashResetToken("token-two"));
});

test("generateResetToken returns a high-entropy, URL-safe, unique token", () => {
  const a = generateResetToken();
  const b = generateResetToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 32);
});
