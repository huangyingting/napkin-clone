import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { openDeckFromJson, looksLikeDeckV7 } from "./open-deck";

// ---------------------------------------------------------------------------
// Minimal v7 fixture
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

// ---------------------------------------------------------------------------
// Minimal v6 fixture
// ---------------------------------------------------------------------------

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
// openDeckFromJson — v7 pass-through
// ---------------------------------------------------------------------------

describe("openDeckFromJson — v7 pass-through", () => {
  test("accepts a valid v7 deck and returns migrated=false", () => {
    const result = openDeckFromJson(MINIMAL_V7);
    assert.ok(result.ok);
    assert.equal(result.deck.schemaVersion, 7);
    assert.equal(result.migrated, false);
  });

  test("returns ok=false with validation errors for a malformed v7 deck", () => {
    const bad = { ...MINIMAL_V7, slides: [] }; // slides must be non-empty
    const result = openDeckFromJson(bad);
    assert.ok(!result.ok);
    assert.ok(result.error.length > 0);
  });

  test("returns ok=false for a v7 deck missing required fields", () => {
    const bad = { schemaVersion: 7, slides: null };
    const result = openDeckFromJson(bad);
    assert.ok(!result.ok);
  });
});

// ---------------------------------------------------------------------------
// openDeckFromJson — v6 migration at boundary
// ---------------------------------------------------------------------------

describe("openDeckFromJson — v6 migration", () => {
  test("migrates a valid v6 deck and returns migrated=true", () => {
    const result = openDeckFromJson(MINIMAL_V6);
    assert.ok(result.ok);
    assert.equal(result.deck.schemaVersion, 7);
    assert.equal(result.migrated, true);
  });

  test("migrated deck has at least one slide", () => {
    const result = openDeckFromJson(MINIMAL_V6);
    assert.ok(result.ok);
    assert.ok(result.deck.slides.length > 0);
  });

  test("migrates a v6 deck with no slides (produces placeholder)", () => {
    const noSlides = { ...MINIMAL_V6, slides: [] };
    const result = openDeckFromJson(noSlides);
    assert.ok(result.ok);
    assert.equal(result.deck.schemaVersion, 7);
    assert.ok(result.deck.slides.length >= 1);
  });
});

// ---------------------------------------------------------------------------
// openDeckFromJson — unknown / missing version
// ---------------------------------------------------------------------------

describe("openDeckFromJson — unknown schema version", () => {
  test("returns ok=false for a non-object input", () => {
    assert.ok(!openDeckFromJson(null).ok);
    assert.ok(!openDeckFromJson("string").ok);
    assert.ok(!openDeckFromJson(42).ok);
    assert.ok(!openDeckFromJson([]).ok);
  });

  test("returns ok=false for an object with no schemaVersion", () => {
    const result = openDeckFromJson({ slides: [] });
    assert.ok(!result.ok);
  });

  test("returns ok=false for a string schemaVersion", () => {
    const result = openDeckFromJson({ schemaVersion: "7", slides: [] });
    assert.ok(!result.ok);
  });
});

// ---------------------------------------------------------------------------
// looksLikeDeckV7
// ---------------------------------------------------------------------------

describe("looksLikeDeckV7", () => {
  test("returns true for an object with schemaVersion 7", () => {
    assert.equal(looksLikeDeckV7({ schemaVersion: 7 }), true);
  });

  test("returns false for schemaVersion 6", () => {
    assert.equal(looksLikeDeckV7({ schemaVersion: 6 }), false);
  });

  test("returns false for null and non-objects", () => {
    assert.equal(looksLikeDeckV7(null), false);
    assert.equal(looksLikeDeckV7("7"), false);
    assert.equal(looksLikeDeckV7(7), false);
  });

  test("returns false for an object without schemaVersion", () => {
    assert.equal(looksLikeDeckV7({}), false);
  });
});
