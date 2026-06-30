/**
 * Tests for performance budgets (issue #461).
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  checkBudget,
  checkDeckJsonBudget,
  checkInlineImageBudget,
  checkLexicalStateBudget,
  checkSlideCountBudget,
  checkVisualCountBudget,
  CONTENT_HARD_BYTES,
  CONTENT_WARN_BYTES,
  DECK_JSON_HARD_BYTES,
  DECK_JSON_WARN_BYTES,
  ELEMENTS_PER_SLIDE_HARD_COUNT,
  ELEMENTS_PER_SLIDE_WARN_COUNT,
  INLINE_IMAGE_HARD_BYTES,
  INLINE_IMAGE_WARN_BYTES,
  INLINE_IMAGES_HARD_COUNT,
  INLINE_IMAGES_WARN_COUNT,
  LEXICAL_STATE_HARD_BYTES,
  LEXICAL_STATE_WARN_BYTES,
  SLIDES_HARD_COUNT,
  SLIDES_WARN_COUNT,
  VISUALS_PER_DOCUMENT_HARD_COUNT,
  VISUALS_PER_DOCUMENT_WARN_COUNT,
} from "./perf-budgets";

// ---------------------------------------------------------------------------
// Constant sanity checks
// ---------------------------------------------------------------------------

describe("budget constants (#461)", () => {
  test("warning thresholds are strictly below hard limits", () => {
    assert.ok(DECK_JSON_WARN_BYTES < DECK_JSON_HARD_BYTES);
    assert.ok(LEXICAL_STATE_WARN_BYTES < LEXICAL_STATE_HARD_BYTES);
    assert.ok(CONTENT_WARN_BYTES < CONTENT_HARD_BYTES);
    assert.ok(SLIDES_WARN_COUNT < SLIDES_HARD_COUNT);
    assert.ok(ELEMENTS_PER_SLIDE_WARN_COUNT < ELEMENTS_PER_SLIDE_HARD_COUNT);
    assert.ok(
      VISUALS_PER_DOCUMENT_WARN_COUNT < VISUALS_PER_DOCUMENT_HARD_COUNT,
    );
    assert.ok(INLINE_IMAGE_WARN_BYTES < INLINE_IMAGE_HARD_BYTES);
    assert.ok(INLINE_IMAGES_WARN_COUNT < INLINE_IMAGES_HARD_COUNT);
  });

  test("deck JSON hard limit is 500 000 bytes (matches existing MAX_DECK_JSON_BYTES)", () => {
    assert.equal(DECK_JSON_HARD_BYTES, 500_000);
  });

  test("slides hard count is 50 (matches DEFAULT_MAX_SLIDES from export-preflight)", () => {
    assert.equal(SLIDES_HARD_COUNT, 50);
  });

  test("lexical state hard limit is 2 000 000 bytes (matches actions.ts)", () => {
    assert.equal(LEXICAL_STATE_HARD_BYTES, 2_000_000);
  });

  test("content hard limit is 100 000 bytes (matches actions.ts)", () => {
    assert.equal(CONTENT_HARD_BYTES, 100_000);
  });

  test("all hard limits are positive integers", () => {
    const hardLimits = [
      DECK_JSON_HARD_BYTES,
      LEXICAL_STATE_HARD_BYTES,
      CONTENT_HARD_BYTES,
      SLIDES_HARD_COUNT,
      ELEMENTS_PER_SLIDE_HARD_COUNT,
      VISUALS_PER_DOCUMENT_HARD_COUNT,
      INLINE_IMAGE_HARD_BYTES,
      INLINE_IMAGES_HARD_COUNT,
    ];
    for (const limit of hardLimits) {
      assert.ok(
        Number.isInteger(limit) && limit > 0,
        `Limit ${limit} is not a positive integer`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// checkBudget helper
// ---------------------------------------------------------------------------

describe("checkBudget (#461)", () => {
  test("value below warning: no warn, no exceed", () => {
    const result = checkBudget("test", 100, 200, 300);
    assert.equal(result.exceeded, false);
    assert.equal(result.warned, false);
    assert.equal(result.metric, "test");
    assert.equal(result.actual, 100);
  });

  test("value above warning but below hard: warned, not exceeded", () => {
    const result = checkBudget("test", 250, 200, 300);
    assert.equal(result.warned, true);
    assert.equal(result.exceeded, false);
  });

  test("value exactly at warning threshold: warned", () => {
    const result = checkBudget("test", 200, 200, 300);
    // actual > warnAt is false when equal → not warned (strict)
    assert.equal(result.warned, false);
    assert.equal(result.exceeded, false);
  });

  test("value one above warning: warned", () => {
    const result = checkBudget("test", 201, 200, 300);
    assert.equal(result.warned, true);
    assert.equal(result.exceeded, false);
  });

  test("value exactly at hard limit: warned=true, exceeded=false", () => {
    const result = checkBudget("test", 300, 200, 300);
    // actual (300) > hardAt (300) → false → exceeded = false
    assert.equal(result.exceeded, false);
    // actual (300) > warnAt (200) && actual (300) <= hardAt (300) → warned = true
    assert.equal(result.warned, true);
  });

  test("value one above hard limit: exceeded", () => {
    const result = checkBudget("test", 301, 200, 300);
    assert.equal(result.exceeded, true);
    assert.equal(result.warned, false); // exceeded overrides warning in interpretation
  });
});

// ---------------------------------------------------------------------------
// Convenience checkers
// ---------------------------------------------------------------------------

describe("checkDeckJsonBudget (#461)", () => {
  test("1 KB deck: no warn, no exceed", () => {
    const r = checkDeckJsonBudget(1_000);
    assert.equal(r.exceeded, false);
    assert.equal(r.warned, false);
    assert.equal(r.hardAt, DECK_JSON_HARD_BYTES);
  });

  test("deck at 85% of hard limit: warns", () => {
    const r = checkDeckJsonBudget(Math.round(DECK_JSON_HARD_BYTES * 0.85));
    assert.equal(r.warned, true);
    assert.equal(r.exceeded, false);
  });

  test("deck at hard limit + 1: exceeded", () => {
    const r = checkDeckJsonBudget(DECK_JSON_HARD_BYTES + 1);
    assert.equal(r.exceeded, true);
  });
});

describe("checkSlideCountBudget (#461)", () => {
  test("10 slides: no warn, no exceed", () => {
    const r = checkSlideCountBudget(10);
    assert.equal(r.exceeded, false);
    assert.equal(r.warned, false);
  });

  test("45 slides: warns (above SLIDES_WARN_COUNT=40)", () => {
    const r = checkSlideCountBudget(45);
    assert.equal(r.warned, true);
    assert.equal(r.exceeded, false);
  });

  test("51 slides: exceeded", () => {
    const r = checkSlideCountBudget(51);
    assert.equal(r.exceeded, true);
  });
});

describe("checkLexicalStateBudget (#461)", () => {
  test("small document: no warn", () => {
    const r = checkLexicalStateBudget(10_000);
    assert.equal(r.exceeded, false);
    assert.equal(r.warned, false);
  });

  test("document at hard limit + 1: exceeded", () => {
    const r = checkLexicalStateBudget(LEXICAL_STATE_HARD_BYTES + 1);
    assert.equal(r.exceeded, true);
  });
});

describe("checkVisualCountBudget (#461)", () => {
  test("0 visuals: no warn", () => {
    const r = checkVisualCountBudget(0);
    assert.equal(r.exceeded, false);
    assert.equal(r.warned, false);
  });

  test("160 visuals: warned", () => {
    const r = checkVisualCountBudget(160);
    assert.equal(r.warned, true);
    assert.equal(r.exceeded, false);
  });

  test("201 visuals: exceeded", () => {
    const r = checkVisualCountBudget(201);
    assert.equal(r.exceeded, true);
  });
});

describe("checkInlineImageBudget (#461)", () => {
  test("small image: no warn", () => {
    const r = checkInlineImageBudget(10_000);
    assert.equal(r.exceeded, false);
    assert.equal(r.warned, false);
  });

  test("image at 80% of hard limit: warns", () => {
    const r = checkInlineImageBudget(Math.round(INLINE_IMAGE_HARD_BYTES * 0.8));
    // 80% of 400_000 = 320_000; INLINE_IMAGE_WARN_BYTES = 300_000
    assert.equal(r.warned, true);
  });

  test("image above hard limit: exceeded", () => {
    const r = checkInlineImageBudget(INLINE_IMAGE_HARD_BYTES + 1);
    assert.equal(r.exceeded, true);
  });
});

// ---------------------------------------------------------------------------
// Large-fixture budget guards (deterministic size checks)
// ---------------------------------------------------------------------------

describe("large fixture budget guards (#461)", () => {
  function makeSlide(index: number): unknown {
    return {
      id: `slide-${index}`,
      index,
      title: `Slide ${index}`,
      notes: "",
    };
  }

  function makeDeck(slideCount: number): unknown {
    return {
      design: { themeId: "default" },
      slides: Array.from({ length: slideCount }, (_, i) => makeSlide(i)),
    };
  }

  test("deck with 50 slides (exactly at hard limit) does not trip exceeded", () => {
    const deck = makeDeck(50) as { slides: unknown[] };
    const r = checkSlideCountBudget(deck.slides.length);
    assert.equal(r.exceeded, false);
  });

  test("deck with 51 slides trips the hard limit", () => {
    const deck = makeDeck(51) as { slides: unknown[] };
    const r = checkSlideCountBudget(deck.slides.length);
    assert.equal(r.exceeded, true);
  });

  test("deck JSON size check on serialized large deck", () => {
    // Build a 45-slide deck and serialize it to check its byte size.
    const deck = makeDeck(45);
    const json = JSON.stringify(deck);
    const r = checkDeckJsonBudget(json.length);
    // A skeleton deck (no images) at 45 slides is well under 500 KB.
    assert.equal(
      r.exceeded,
      false,
      "45-slide skeleton deck should be within budget",
    );
  });

  test("artificially oversized payload is detected by checkDeckJsonBudget", () => {
    // Build a payload that exceeds the hard limit.
    const bigPayload = "x".repeat(DECK_JSON_HARD_BYTES + 1);
    const r = checkDeckJsonBudget(bigPayload.length);
    assert.equal(r.exceeded, true);
  });
});
