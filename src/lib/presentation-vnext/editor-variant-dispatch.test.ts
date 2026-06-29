/**
 * Focused tests for v7 editor variant dispatch helpers.
 *
 * Verifies the detection / open / migration logic that drives the
 * `SlideEditorVNext` vs `SlideEditor` (v6) routing in
 * `use-slide-editor-open.ts`.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { looksLikeDeckV7, openDeckFromJson } from "./open-deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_V7 = {
  schemaVersion: 7,
  canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
  theme: { packageId: "neutral" },
  assets: { images: {} },
  slides: [
    {
      id: "slide-0001",
      type: "slide",
      template: { kind: "cover" },
      style: { ref: "slide.cover" },
      children: [],
    },
  ],
};

const MINIMAL_V6 = {
  schemaVersion: 6,
  canvas: { format: "16:9" },
  design: { themeId: "default" },
  slides: [
    {
      id: "s1",
      title: "Title Slide",
      elements: [
        {
          id: "e1",
          kind: "text",
          role: "title",
          box: { x: 8, y: 8, w: 84, h: 14 },
          zIndex: 1,
          content: { text: "Hello" },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// looksLikeDeckV7 — variant detection
// ---------------------------------------------------------------------------

describe("looksLikeDeckV7 — variant detection for editor dispatch", () => {
  test("returns true for a v7 deck (schemaVersion: 7)", () => {
    assert.equal(looksLikeDeckV7(MINIMAL_V7), true);
    assert.equal(looksLikeDeckV7({ schemaVersion: 7 }), true);
  });

  test("returns false for a v6 deck", () => {
    assert.equal(looksLikeDeckV7(MINIMAL_V6), false);
  });

  test("returns false for null, non-objects, and unknown versions", () => {
    assert.equal(looksLikeDeckV7(null), false);
    assert.equal(looksLikeDeckV7(undefined), false);
    assert.equal(looksLikeDeckV7("7"), false);
    assert.equal(looksLikeDeckV7(7), false);
    assert.equal(looksLikeDeckV7({ schemaVersion: 8 }), false);
    assert.equal(looksLikeDeckV7({}), false);
  });
});

// ---------------------------------------------------------------------------
// openDeckFromJson — open helper for v7 and migration path
// ---------------------------------------------------------------------------

describe("openDeckFromJson — open helper variant behaviour", () => {
  test("v7 input: returns ok=true with migrated=false and schemaVersion=7", () => {
    const result = openDeckFromJson(MINIMAL_V7);
    assert.ok(result.ok);
    assert.equal(result.deck.schemaVersion, 7);
    assert.equal(result.migrated, false);
  });

  test("v6 input: returns ok=true with migrated=true and schemaVersion=7 (migration at boundary)", () => {
    const result = openDeckFromJson(MINIMAL_V6);
    assert.ok(result.ok);
    assert.equal(result.deck.schemaVersion, 7);
    assert.equal(result.migrated, true);
    assert.ok(
      result.deck.slides.length > 0,
      "Migrated deck should have at least one slide",
    );
  });

  test("unknown input: returns ok=false", () => {
    assert.equal(openDeckFromJson(null).ok, false);
    assert.equal(openDeckFromJson({ schemaVersion: 99 }).ok, false);
    assert.equal(openDeckFromJson("string").ok, false);
  });

  test("v7 deck with missing required fields returns ok=false", () => {
    const bad = { schemaVersion: 7, slides: null };
    const result = openDeckFromJson(bad);
    assert.ok(!result.ok);
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Preview mapping — when to use DeckGenerationPreviewVNext
// ---------------------------------------------------------------------------

describe("Preview mapping: v6 → v7 migration at regenerate boundary", () => {
  test("a v6 deck migrated via openDeckFromJson has schemaVersion 7", () => {
    // Simulates what DeckGenerationPreviewVNext.handleRegenerate does
    // when the API returns a v6 deck: migrate it to v7 before updating proposal.
    const v6Deck = MINIMAL_V6;
    const migrated = openDeckFromJson(v6Deck);
    assert.ok(migrated.ok, "Migration should succeed");
    assert.equal(migrated.deck.schemaVersion, 7);
    assert.equal(migrated.migrated, true);
    assert.ok(
      Array.isArray(migrated.deck.slides) && migrated.deck.slides.length > 0,
    );
  });

  test("a v7 deck from the API passes through openDeckFromJson unchanged (migrated=false)", () => {
    const v7Deck = MINIMAL_V7;
    const result = openDeckFromJson(v7Deck);
    assert.ok(result.ok);
    assert.equal(result.migrated, false);
    assert.equal(result.deck.schemaVersion, 7);
    assert.equal(result.deck.slides[0].id, "slide-0001");
  });
});
