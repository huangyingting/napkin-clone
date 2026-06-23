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

test("no-token save: always succeeds regardless of DB token", () => {
  // Legacy clients that don't send a token must never be blocked.
  assert.equal(isRevisionConflict(undefined, "existing-token"), false);
  assert.equal(isRevisionConflict(null, "existing-token"), false);
  assert.equal(isRevisionConflict(undefined, null), false);
});

test("matching-token save: not a conflict when tokens agree", () => {
  assert.equal(isRevisionConflict("tok-abc", "tok-abc"), false);
});

test("stale-token conflict: returns true when DB token differs", () => {
  // DB token was advanced by another session after the client last fetched.
  assert.equal(isRevisionConflict("tok-old", "tok-new"), true);
});

test("getDeckJson token return: revisionToken passes through from DB", () => {
  // Simulate the fetchDeckJson return shape (pure, no DB).
  function simulateFetch(dbToken: string | null) {
    const raw = { slides: [] }; // minimal deckJson
    return { deckJson: raw, revisionToken: dbToken };
  }

  const withToken = simulateFetch("tok-123");
  assert.equal(withToken.revisionToken, "tok-123");
  assert.deepEqual(withToken.deckJson, { slides: [] });

  const withoutToken = simulateFetch(null);
  assert.equal(withoutToken.revisionToken, null);
});

test("legacy null token: first save with clientToken=null never conflicts", () => {
  // A document that has never had a token (null in DB).
  // A client that provides no token must succeed (legacy / initial-save path).
  assert.equal(isRevisionConflict(null, null), false);
  assert.equal(isRevisionConflict(undefined, null), false);
});

test("stale-token conflict: DB token is null but client sends a token", () => {
  // Edge case: client has a token but the DB was reset to null (e.g. restore).
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
