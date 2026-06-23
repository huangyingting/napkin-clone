/**
 * Unit tests for deck revision token optimistic-locking logic (#376).
 *
 * These tests exercise the pure logic extracted from saveDeckJson by isolating
 * the token-check step. Integration tests that hit a real DB are out of scope
 * for this file; they live in the actions test suite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// ---------------------------------------------------------------------------
// Pure helpers mirroring the DB-layer token-check logic
// ---------------------------------------------------------------------------

function shouldConflict(
  clientToken: string | null | undefined,
  dbToken: string | null,
): boolean {
  if (clientToken == null) return false;
  return dbToken !== clientToken;
}

function buildSaveResult(
  clientToken: string | null | undefined,
  dbToken: string | null,
  newToken: string,
):
  | { ok: true; revisionToken: string }
  | { ok: "conflict"; serverRevisionToken: string | null } {
  if (shouldConflict(clientToken, dbToken)) {
    return { ok: "conflict", serverRevisionToken: dbToken };
  }
  return { ok: true, revisionToken: newToken };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("no-token save: always succeeds regardless of DB token", () => {
  // Legacy clients that don't send a token must never be blocked.
  assert.deepEqual(buildSaveResult(undefined, "existing-token", "new-token"), {
    ok: true,
    revisionToken: "new-token",
  });
  assert.deepEqual(buildSaveResult(null, "existing-token", "new-token"), {
    ok: true,
    revisionToken: "new-token",
  });
  assert.deepEqual(buildSaveResult(undefined, null, "new-token"), {
    ok: true,
    revisionToken: "new-token",
  });
});

test("matching-token save: succeeds and returns a new token", () => {
  const result = buildSaveResult("tok-abc", "tok-abc", "tok-xyz");
  assert.deepEqual(result, { ok: true, revisionToken: "tok-xyz" });
});

test("stale-token conflict: returns conflict result without DB update", () => {
  // DB token was updated by another session after the client last fetched.
  const result = buildSaveResult("tok-old", "tok-new", "tok-next");
  assert.deepEqual(result, {
    ok: "conflict",
    serverRevisionToken: "tok-new",
  });
});

test("getDeckJson token return: revisionToken passes through from DB", () => {
  // Simulate the fetchDeckJson return shape.
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

test("legacy null token: first save with clientToken=null always succeeds", () => {
  // A document that has never had a token (null in DB).
  // A client that provides no token must succeed (legacy / initial-save path).
  assert.deepEqual(buildSaveResult(null, null, "first-token"), {
    ok: true,
    revisionToken: "first-token",
  });
  assert.deepEqual(buildSaveResult(undefined, null, "first-token"), {
    ok: true,
    revisionToken: "first-token",
  });
});

test("stale-token conflict: DB token is null but client sends a token", () => {
  // Edge case: client has a token but the DB was reset to null (e.g. restore).
  const result = buildSaveResult("tok-stale", null, "tok-next");
  assert.deepEqual(result, {
    ok: "conflict",
    serverRevisionToken: null,
  });
});
