/**
 * Tests for the patch autosave adapter (issue #473).
 *
 * Covers:
 *  - Patch success path: `saveDeckPatch` succeeds → revision token updated.
 *  - Patch fallback: `saveDeckPatch` returns "fallback" → whole-deck save.
 *  - Patch conflict: `saveDeckPatch` returns "conflict" → conflict surfaced.
 *  - No patches: falls back to whole-deck save directly.
 *  - Deck-save conflict: whole-deck save returns "conflict".
 *  - Deck-save error: propagated as `{ ok: false }`.
 *  - Network error in patch save: falls through to whole-deck save.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { attemptPatchAutosave } from "./patch-autosave";
import type { PatchSaveFn, DeckSaveFn } from "./patch-autosave";
import type { Deck } from "@/lib/presentation/deck";
import type { DeckPatch } from "@/lib/presentation/slide-commands";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDeck(): Deck {
  return {
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide 1",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
      },
    ],
  };
}

function makePatch(op: DeckPatch["op"] = "deck.set_theme"): DeckPatch {
  return {
    schemaVersion: 1,
    op,
    slideIds: [],
    elementIds: [],
  };
}

const DOC_ID = "doc-test-1";
const TOKEN = "rev-token-abc";
const NEW_TOKEN = "rev-token-xyz";

// ---------------------------------------------------------------------------
// Patch success path
// ---------------------------------------------------------------------------

describe("patch success path", () => {
  test("uses patch save when patches available and patch succeeds", async () => {
    const deck = makeDeck();
    const patches = [makePatch()];
    let patchCalled = false;
    let deckCalled = false;

    const savePatch: PatchSaveFn = async (id, p, token) => {
      patchCalled = true;
      assert.strictEqual(id, DOC_ID);
      assert.deepStrictEqual(p, patches);
      assert.strictEqual(token, TOKEN);
      return { ok: true, revisionToken: NEW_TOKEN };
    };

    const saveDeck: DeckSaveFn = async () => {
      deckCalled = true;
      return { ok: true, revisionToken: "should-not-be-called" };
    };

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      patches,
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.ok(patchCalled, "savePatchFn should have been called");
    assert.ok(
      !deckCalled,
      "saveDeckFn should NOT have been called on patch success",
    );
    assert.strictEqual(result.ok, true);
    assert.ok(result.ok === true && result.method === "patch");
    assert.ok(result.ok === true && result.revisionToken === NEW_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Patch fallback path
// ---------------------------------------------------------------------------

describe("patch fallback path", () => {
  test("falls back to whole-deck save when patch returns 'fallback'", async () => {
    const deck = makeDeck();
    const patches = [makePatch()];
    let deckCalled = false;

    const savePatch: PatchSaveFn = async () => ({ ok: "fallback" });

    const saveDeck: DeckSaveFn = async (id, _deck, token) => {
      deckCalled = true;
      assert.strictEqual(id, DOC_ID);
      assert.strictEqual(token, TOKEN);
      return { ok: true, revisionToken: NEW_TOKEN };
    };

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      patches,
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.ok(deckCalled, "saveDeckFn should have been called as fallback");
    assert.strictEqual(result.ok, true);
    assert.ok(result.ok === true && result.method === "deck");
    assert.ok(result.ok === true && result.revisionToken === NEW_TOKEN);
  });

  test("falls back to whole-deck save when patch returns error", async () => {
    const deck = makeDeck();
    const patches = [makePatch()];

    const savePatch: PatchSaveFn = async () => ({
      ok: false,
      error: "Patch validation failed.",
    });

    const saveDeck: DeckSaveFn = async () => ({
      ok: true,
      revisionToken: NEW_TOKEN,
    });

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      patches,
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.strictEqual(result.ok, true);
    assert.ok(result.ok === true && result.method === "deck");
  });
});

// ---------------------------------------------------------------------------
// Patch conflict path
// ---------------------------------------------------------------------------

describe("patch conflict path", () => {
  test("surfaces conflict when patch save returns 'conflict'", async () => {
    const deck = makeDeck();
    const patches = [makePatch()];
    const SERVER_TOKEN = "server-token-new";

    const savePatch: PatchSaveFn = async () => ({
      ok: "conflict",
      serverRevisionToken: SERVER_TOKEN,
    });

    const saveDeck: DeckSaveFn = async () => {
      throw new Error("should not be called on conflict");
    };

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      patches,
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.strictEqual(result.ok, "conflict");
    assert.ok(
      result.ok === "conflict" && result.serverRevisionToken === SERVER_TOKEN,
    );
  });
});

// ---------------------------------------------------------------------------
// No patches → whole-deck save
// ---------------------------------------------------------------------------

describe("no-patch fallback", () => {
  test("skips patch save entirely when patches array is empty", async () => {
    const deck = makeDeck();
    let patchCalled = false;

    const savePatch: PatchSaveFn = async () => {
      patchCalled = true;
      return { ok: "fallback" };
    };

    const saveDeck: DeckSaveFn = async () => ({
      ok: true,
      revisionToken: NEW_TOKEN,
    });

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      [],
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.ok(
      !patchCalled,
      "savePatchFn should NOT have been called with empty patches",
    );
    assert.strictEqual(result.ok, true);
    assert.ok(result.ok === true && result.method === "deck");
  });
});

// ---------------------------------------------------------------------------
// Whole-deck conflict
// ---------------------------------------------------------------------------

describe("whole-deck conflict", () => {
  test("surfaces conflict from whole-deck save", async () => {
    const deck = makeDeck();
    const SERVER_TOKEN = "server-token-conflict";

    const savePatch: PatchSaveFn = async () => ({ ok: "fallback" });
    const saveDeck: DeckSaveFn = async () => ({
      ok: "conflict",
      serverRevisionToken: SERVER_TOKEN,
    });

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      [makePatch()],
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.strictEqual(result.ok, "conflict");
    assert.ok(
      result.ok === "conflict" && result.serverRevisionToken === SERVER_TOKEN,
    );
  });
});

// ---------------------------------------------------------------------------
// Whole-deck error
// ---------------------------------------------------------------------------

describe("whole-deck error", () => {
  test("propagates error from whole-deck save", async () => {
    const deck = makeDeck();

    const savePatch: PatchSaveFn = async () => ({ ok: "fallback" });
    const saveDeck: DeckSaveFn = async () => ({
      ok: false,
      error: "Deck is too large to save.",
    });

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      [makePatch()],
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.strictEqual(result.ok, false);
    assert.ok(result.ok === false && result.error.includes("too large"));
  });
});

// ---------------------------------------------------------------------------
// Network error in patch save → fallback
// ---------------------------------------------------------------------------

describe("network error fallback", () => {
  test("falls back to whole-deck save on network error in patch save", async () => {
    const deck = makeDeck();
    const patches = [makePatch()];

    const savePatch: PatchSaveFn = async () => {
      throw new Error("Network failure");
    };

    const saveDeck: DeckSaveFn = async () => ({
      ok: true,
      revisionToken: NEW_TOKEN,
    });

    const result = await attemptPatchAutosave(
      DOC_ID,
      deck,
      patches,
      TOKEN,
      savePatch,
      saveDeck,
    );

    assert.strictEqual(result.ok, true);
    assert.ok(result.ok === true && result.method === "deck");
  });
});

// ---------------------------------------------------------------------------
// Null clientToken (first save — no optimistic lock)
// ---------------------------------------------------------------------------

describe("null client token", () => {
  test("passes null token to both save functions", async () => {
    const deck = makeDeck();
    const patches = [makePatch()];
    let capturedToken: string | null | undefined = "UNSET";

    const savePatch: PatchSaveFn = async (_id, _p, token) => {
      capturedToken = token;
      return { ok: "fallback" };
    };
    const saveDeck: DeckSaveFn = async () => ({
      ok: true,
      revisionToken: NEW_TOKEN,
    });

    await attemptPatchAutosave(
      DOC_ID,
      deck,
      patches,
      null,
      savePatch,
      saveDeck,
    );
    assert.strictEqual(capturedToken, null);
  });
});
