/**
 * Unit tests for deck revision token optimistic-locking logic (#376).
 *
 * These tests exercise the pure helpers in `deck-revision-token.ts` that are
 * used by `saveDeckJson` to decide whether a save should proceed or conflict.
 * Integration tests that hit a real DB are out of scope for this file; they
 * live in the actions test suite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateRevisionToken,
  isRevisionConflict,
} from "./deck-revision-token";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("no-token save: conflicts regardless of DB token", () => {
  assert.equal(isRevisionConflict(undefined, "existing-token"), true);
  assert.equal(isRevisionConflict(null, "existing-token"), true);
  assert.equal(isRevisionConflict(undefined, null), true);
});

test("matching-token save: not a conflict when tokens agree", () => {
  assert.equal(isRevisionConflict("tok-abc", "tok-abc"), false);
});

test("stale-token conflict: returns true when DB token differs", () => {
  // DB token was advanced by another session after the client last fetched.
  assert.equal(isRevisionConflict("tok-old", "tok-new"), true);
});

test("round-trip: fresh token is not a conflict with itself, stale token is", () => {
  // Exercises the interaction between the two production exports: a token
  // generated for a save must not conflict when echoed back, but any other
  // token must be detected as stale.
  const serverToken = generateRevisionToken();
  assert.equal(
    isRevisionConflict(serverToken, serverToken),
    false,
    "matching token must not conflict",
  );

  const clientStale = generateRevisionToken();
  assert.equal(
    isRevisionConflict(clientStale, serverToken),
    true,
    "different token must conflict",
  );
});

test("missing server token conflicts", () => {
  assert.equal(isRevisionConflict(null, null), true);
  assert.equal(isRevisionConflict(undefined, null), true);
});

test("stale-token conflict: DB token is null but client sends a token", () => {
  assert.equal(isRevisionConflict("tok-stale", null), true);
});

test("generateRevisionToken: produces a 24-character URL-safe string", () => {
  const token = generateRevisionToken();
  assert.equal(typeof token, "string");
  assert.equal(token.length, 24);
  assert.match(
    token,
    /^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]+$/,
  );
});

test("generateRevisionToken: each call produces a unique token", () => {
  const tokens = new Set(
    Array.from({ length: 20 }, () => generateRevisionToken()),
  );
  // Collision probability at 24 chars from 54-char alphabet is astronomically low.
  assert.equal(tokens.size, 20);
});
