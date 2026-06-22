import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  MIN_SUPPORTED_DECK_SCHEMA_VERSION,
  migrateDeck,
} from "./deck-migration";
import { safeParseDeck } from "./deck-schema";

// ---------------------------------------------------------------------------
// Minimal valid deck payload (no schemaVersion — legacy)
// ---------------------------------------------------------------------------

function minimalLegacyDeck(): unknown {
  return {
    theme: "default",
    slides: [
      {
        index: 0,
        title: "Hello",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
      },
    ],
  };
}

function minimalDeckWithVersion(version: number | undefined): unknown {
  const base = minimalLegacyDeck() as Record<string, unknown>;
  if (version === undefined) return base;
  return { ...base, schemaVersion: version };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("CURRENT_DECK_SCHEMA_VERSION is 1", () => {
  assert.equal(CURRENT_DECK_SCHEMA_VERSION, 1);
});

test("MIN_SUPPORTED_DECK_SCHEMA_VERSION is 0", () => {
  assert.equal(MIN_SUPPORTED_DECK_SCHEMA_VERSION, 0);
});

// ---------------------------------------------------------------------------
// migrateDeck — unit
// ---------------------------------------------------------------------------

test("migrateDeck stamps schemaVersion on legacy deck (no field)", () => {
  const raw = minimalLegacyDeck() as Record<string, unknown>;
  assert.equal(raw.schemaVersion, undefined);
  const result = migrateDeck(raw) as Record<string, unknown>;
  assert.equal(result.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
});

test("migrateDeck stamps schemaVersion on deck with explicit version 0", () => {
  const raw = { ...(minimalLegacyDeck() as object), schemaVersion: 0 };
  const result = migrateDeck(raw) as Record<string, unknown>;
  assert.equal(result.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
});

test("migrateDeck passes through a current-version deck unchanged", () => {
  const raw = {
    ...(minimalLegacyDeck() as object),
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
  const result = migrateDeck(raw);
  assert.equal(result, raw); // same reference — no copy
});

test("migrateDeck passes through a future-version deck (validateDeck will reject)", () => {
  const futureVersion = CURRENT_DECK_SCHEMA_VERSION + 1;
  const raw = {
    ...(minimalLegacyDeck() as object),
    schemaVersion: futureVersion,
  };
  const result = migrateDeck(raw) as Record<string, unknown>;
  // migrateDeck must not alter the version — it returns the payload unchanged
  assert.equal(result.schemaVersion, futureVersion);
});

test("migrateDeck returns non-object payloads unchanged", () => {
  assert.equal(migrateDeck(null), null);
  assert.equal(migrateDeck(undefined), undefined);
  assert.equal(migrateDeck("string"), "string");
  assert.equal(migrateDeck(42), 42);
  assert.deepEqual(migrateDeck([1, 2, 3]), [1, 2, 3]);
});

test("migrateDeck does not mutate the original object", () => {
  const raw = minimalLegacyDeck() as Record<string, unknown>;
  migrateDeck(raw);
  assert.equal(raw.schemaVersion, undefined);
});

test("migrateDeck preserves all existing deck fields", () => {
  const raw = {
    ...(minimalLegacyDeck() as object),
    themeId: "my-theme",
    deckContentHash: "abc123",
  } as Record<string, unknown>;
  const result = migrateDeck(raw) as Record<string, unknown>;
  assert.equal(result.themeId, "my-theme");
  assert.equal(result.deckContentHash, "abc123");
  assert.equal(result.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
});

// ---------------------------------------------------------------------------
// safeParseDeck — migration integration
// ---------------------------------------------------------------------------

test("safeParseDeck accepts legacy deck and stamps schemaVersion", () => {
  const result = safeParseDeck(minimalLegacyDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
  }
});

test("safeParseDeck accepts deck with explicit schemaVersion 0 and stamps current", () => {
  const result = safeParseDeck(minimalDeckWithVersion(0));
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
  }
});

test("safeParseDeck accepts current-version deck", () => {
  const result = safeParseDeck(
    minimalDeckWithVersion(CURRENT_DECK_SCHEMA_VERSION),
  );
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
  }
});

test("safeParseDeck rejects unsupported future version", () => {
  const futureVersion = CURRENT_DECK_SCHEMA_VERSION + 1;
  const result = safeParseDeck(minimalDeckWithVersion(futureVersion));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.includes(String(futureVersion)),
      `Expected error to mention version ${futureVersion}: ${result.error}`,
    );
  }
});

test("safeParseDeck rejects a large unsupported future version", () => {
  const result = safeParseDeck(minimalDeckWithVersion(999));
  assert.equal(result.success, false);
});

test("safeParseDeck rejects non-integer schemaVersion", () => {
  const raw = { ...(minimalLegacyDeck() as object), schemaVersion: 1.5 };
  const result = safeParseDeck(raw);
  assert.equal(result.success, false);
});

test("safeParseDeck rejects negative schemaVersion", () => {
  const raw = { ...(minimalLegacyDeck() as object), schemaVersion: -1 };
  const result = safeParseDeck(raw);
  assert.equal(result.success, false);
});

test("safeParseDeck rejects string schemaVersion", () => {
  const raw = { ...(minimalLegacyDeck() as object), schemaVersion: "1" };
  const result = safeParseDeck(raw);
  assert.equal(result.success, false);
});

test("safeParseDeck never throws on malformed payload", () => {
  const payloads: unknown[] = [
    null,
    undefined,
    42,
    "not a deck",
    [],
    { slides: "wrong" },
    { slides: [{ notASlide: true }] },
    { schemaVersion: CURRENT_DECK_SCHEMA_VERSION + 99 },
    { schemaVersion: null, slides: null },
  ];
  for (const p of payloads) {
    assert.doesNotThrow(() => safeParseDeck(p));
  }
});

test("safeParseDeck result is idempotent (round-trip)", () => {
  const first = safeParseDeck(minimalLegacyDeck());
  assert.equal(first.success, true);
  if (!first.success) return;

  const second = safeParseDeck(first.data);
  assert.equal(second.success, true);
  if (!second.success) return;

  assert.deepEqual(second.data, first.data);
});

test("safeParseDeck round-trip preserves schemaVersion through JSON serialization", () => {
  const first = safeParseDeck(minimalLegacyDeck());
  assert.equal(first.success, true);
  if (!first.success) return;

  const serialized = JSON.parse(JSON.stringify(first.data)) as unknown;
  const second = safeParseDeck(serialized);
  assert.equal(second.success, true);
  if (!second.success) return;
  assert.equal(second.data.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
});
