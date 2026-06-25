import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSingleUseToken,
  generateSingleUseToken,
  hashSingleUseToken,
  singleUseTokenExpiresAt,
} from "@/lib/auth/single-use-token";

const NOW = new Date("2026-06-21T09:00:00.000Z");

test("single-use token helper centralizes generation and hashing", () => {
  const first = generateSingleUseToken();
  const second = generateSingleUseToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.match(hashSingleUseToken(first), /^[0-9a-f]{64}$/);
  assert.notEqual(hashSingleUseToken(first), first);
});

test("single-use token helper evaluates existence, used, and expiry in order", () => {
  assert.deepEqual(
    evaluateSingleUseToken({
      exists: false,
      expiresAt: null,
      usedAt: null,
      now: NOW,
    }),
    { valid: false, reason: "not_found" },
  );

  assert.deepEqual(
    evaluateSingleUseToken({
      exists: true,
      expiresAt: new Date(NOW.getTime() - 1),
      usedAt: new Date(NOW.getTime() - 2),
      now: NOW,
    }),
    { valid: false, reason: "used" },
  );

  assert.deepEqual(
    evaluateSingleUseToken({
      exists: true,
      expiresAt: NOW,
      usedAt: null,
      now: NOW,
    }),
    { valid: false, reason: "expired" },
  );
});

test("singleUseTokenExpiresAt applies flow-specific TTLs", () => {
  assert.deepEqual(
    singleUseTokenExpiresAt(60_000, NOW),
    new Date("2026-06-21T09:01:00.000Z"),
  );
});
