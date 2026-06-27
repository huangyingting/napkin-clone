/**
 * Unit tests for slide comment anchor semantics (`slide-comment-anchors.ts`).
 * DOM-free, runnable under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import {
  floatAnchorToDeck,
  floatAnchorToSlide,
  resolveAnchorState,
  retargetAnchorSlide,
  retargetAnchorToSlideOnly,
  type SlideCommentAnchor,
} from "./slide-comment-anchors";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function slide(id: string, elementIds: string[] = []): Slide {
  return {
    id,
    index: 0,
    title: "Slide",
    bullets: [],
    notes: "",
    elements: elementIds.map((eid) => ({
      id: eid,
      kind: "text" as const,
      content: { kind: "text" as const, text: "" },
      zIndex: 0,
      box: { x: 0, y: 0, w: 100, h: 10 },
      designOverrides: {
        textStyle: {
          fontSize: 4.5,
          bold: false,
          italic: false,
          align: "left" as const,
        },
      },
    })),
  };
}

function deck(slides: Slide[]): Deck {
  return {
    slides: slides.map((s, i) => ({ ...s, index: i })),
    themeId: "default",
  };
}

function anchor(partial: Partial<SlideCommentAnchor> = {}): SlideCommentAnchor {
  return partial;
}

// ---------------------------------------------------------------------------
// resolveAnchorState — deck-level
// ---------------------------------------------------------------------------

test("resolveAnchorState: no slideId → deck", () => {
  assert.equal(resolveAnchorState(anchor(), deck([])), "deck");
});

test("resolveAnchorState: explicit null slideId → deck", () => {
  assert.equal(resolveAnchorState(anchor({ slideId: null }), deck([])), "deck");
});

test("resolveAnchorState: no slideId, null deck → deck (no deck needed)", () => {
  assert.equal(resolveAnchorState(anchor(), null), "deck");
});

// ---------------------------------------------------------------------------
// resolveAnchorState — unknown
// ---------------------------------------------------------------------------

test("resolveAnchorState: slideId set, null deck → unknown", () => {
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1" }), null),
    "unknown",
  );
});

test("resolveAnchorState: slideId set, undefined deck → unknown", () => {
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1" }), undefined),
    "unknown",
  );
});

// ---------------------------------------------------------------------------
// resolveAnchorState — attached
// ---------------------------------------------------------------------------

test("resolveAnchorState: slideId exists in deck, no elementId → attached", () => {
  const d = deck([slide("sl-1")]);
  assert.equal(resolveAnchorState(anchor({ slideId: "sl-1" }), d), "attached");
});

test("resolveAnchorState: slideId and elementId both exist → attached", () => {
  const d = deck([slide("sl-1", ["el-a", "el-b"])]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1", elementId: "el-a" }), d),
    "attached",
  );
});

test("resolveAnchorState: slide has no elements array, elementId null → attached", () => {
  const s = { ...slide("sl-2"), elements: undefined };
  const d = deck([s]);
  assert.equal(resolveAnchorState(anchor({ slideId: "sl-2" }), d), "attached");
});

// ---------------------------------------------------------------------------
// resolveAnchorState — orphaned
// ---------------------------------------------------------------------------

test("resolveAnchorState: slideId not in deck → orphaned", () => {
  const d = deck([slide("sl-1")]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-gone" }), d),
    "orphaned",
  );
});

test("resolveAnchorState: slideId exists but elementId not found → orphaned", () => {
  const d = deck([slide("sl-1", ["el-a"])]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1", elementId: "el-gone" }), d),
    "orphaned",
  );
});

test("resolveAnchorState: slide has no elements, elementId specified → orphaned", () => {
  const s = { ...slide("sl-1"), elements: undefined };
  const d = deck([s]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1", elementId: "el-x" }), d),
    "orphaned",
  );
});

test("resolveAnchorState: empty deck → orphaned for any slideId", () => {
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1" }), deck([])),
    "orphaned",
  );
});

// ---------------------------------------------------------------------------
// resolveAnchorState — geometry is ignored in resolution
// ---------------------------------------------------------------------------

test("resolveAnchorState: geometry does not affect attached result", () => {
  const d = deck([slide("sl-1", ["el-a"])]);
  assert.equal(
    resolveAnchorState(
      anchor({
        slideId: "sl-1",
        elementId: "el-a",
        geometry: { x: 50, y: 50 },
      }),
      d,
    ),
    "attached",
  );
});

// ---------------------------------------------------------------------------
// floatAnchorToDeck
// ---------------------------------------------------------------------------

test("floatAnchorToDeck: clears slideId, elementId, and geometry", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 10, y: 20 },
  });
  const result = floatAnchorToDeck(a);
  assert.equal(result.slideId, null);
  assert.equal(result.elementId, null);
  assert.equal(result.geometry, null);
});

test("floatAnchorToDeck: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  floatAnchorToDeck(a);
  assert.equal(a.slideId, "sl-1");
});

test("floatAnchorToDeck: result resolves to deck", () => {
  const a = anchor({ slideId: "sl-1" });
  const floated = floatAnchorToDeck(a);
  assert.equal(resolveAnchorState(floated, deck([slide("sl-1")])), "deck");
});

// ---------------------------------------------------------------------------
// floatAnchorToSlide
// ---------------------------------------------------------------------------

test("floatAnchorToSlide: clears elementId, keeps slideId", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 5, y: 5 },
  });
  const result = floatAnchorToSlide(a);
  assert.equal(result.slideId, "sl-1");
  assert.equal(result.elementId, null);
  assert.deepEqual(result.geometry, { x: 5, y: 5 });
});

test("floatAnchorToSlide: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  floatAnchorToSlide(a);
  assert.equal(a.elementId, "el-a");
});

test("floatAnchorToSlide: result resolves to attached when slide exists", () => {
  const d = deck([slide("sl-1", ["el-a"])]);
  const a = anchor({ slideId: "sl-1", elementId: "el-gone" });
  const floated = floatAnchorToSlide(a);
  assert.equal(resolveAnchorState(floated, d), "attached");
});

// ---------------------------------------------------------------------------
// retargetAnchorSlide
// ---------------------------------------------------------------------------

test("retargetAnchorSlide: updates slideId to new target", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 10, y: 10 },
  });
  const result = retargetAnchorSlide(a, "sl-2");
  assert.equal(result.slideId, "sl-2");
  assert.equal(result.elementId, "el-a");
  assert.deepEqual(result.geometry, { x: 10, y: 10 });
});

test("retargetAnchorSlide: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1" });
  retargetAnchorSlide(a, "sl-2");
  assert.equal(a.slideId, "sl-1");
});

test("retargetAnchorSlide: result resolves to attached on new slide", () => {
  const d = deck([slide("sl-1"), slide("sl-2", ["el-a"])]);
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  const retargeted = retargetAnchorSlide(a, "sl-2");
  assert.equal(resolveAnchorState(retargeted, d), "attached");
});

// ---------------------------------------------------------------------------
// retargetAnchorToSlideOnly
// ---------------------------------------------------------------------------

test("retargetAnchorToSlideOnly: updates slideId and clears elementId", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 10, y: 10 },
  });
  const result = retargetAnchorToSlideOnly(a, "sl-2");
  assert.equal(result.slideId, "sl-2");
  assert.equal(result.elementId, null);
  assert.deepEqual(result.geometry, { x: 10, y: 10 });
});

test("retargetAnchorToSlideOnly: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  retargetAnchorToSlideOnly(a, "sl-2");
  assert.equal(a.slideId, "sl-1");
  assert.equal(a.elementId, "el-a");
});

test("retargetAnchorToSlideOnly: result resolves to attached even when elementId would be orphaned", () => {
  const d = deck([slide("sl-1", ["el-a"]), slide("sl-2")]);
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  const retargeted = retargetAnchorToSlideOnly(a, "sl-2");
  assert.equal(resolveAnchorState(retargeted, d), "attached");
});
