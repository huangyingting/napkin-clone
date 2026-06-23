import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { stripOrphanedVisuals } from "./strip-orphans";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function visualElement(id: string, visualId: string): SlideElement {
  return {
    id,
    kind: "visual",
    visualId,
    zIndex: 0,
    box: { x: 0, y: 0, w: 50, h: 50 },
  };
}

function textElement(id: string, text: string): SlideElement {
  return {
    id,
    kind: "text",
    role: "body",
    text,
    zIndex: 1,
    box: { x: 0, y: 0, w: 50, h: 20 },
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
  };
}

function slide(partial: Partial<Slide>): Slide {
  return {
    id: "test-id",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
    ...partial,
  };
}

function deck(slides: Slide[]): Deck {
  return { theme: "default", slides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("drops orphan visual elements", () => {
  const input = deck([
    slide({
      visualIds: ["keep"],
      elements: [
        visualElement("el-keep", "keep"),
        visualElement("el-gone", "gone"),
      ],
    }),
  ]);
  const result = stripOrphanedVisuals(input, new Set(["keep"]));

  assert.deepEqual(
    result.slides[0].elements?.map((el) => el.id),
    ["el-keep"],
  );
});

test("preserves known visuals and non-visual elements", () => {
  const elements: SlideElement[] = [
    textElement("el-text", "hello"),
    visualElement("el-keep", "keep"),
  ];
  const input = deck([slide({ visualIds: ["keep"], elements })]);
  const result = stripOrphanedVisuals(input, new Set(["keep"]));

  assert.deepEqual(result.slides[0].elements, elements);
  assert.deepEqual(result.slides[0].visualIds, ["keep"]);
  // Unchanged slides are returned by identity.
  assert.equal(result.slides[0], input.slides[0]);
});

test("does not mutate the input deck", () => {
  const input = deck([
    slide({
      elements: [
        visualElement("el-keep", "keep"),
        visualElement("el-gone", "gone"),
      ],
    }),
  ]);
  const snapshot = structuredClone(input);

  stripOrphanedVisuals(input, new Set(["keep"]));

  assert.deepEqual(input, snapshot);
});

test("drops all references when knownVisualIds is empty", () => {
  const input = deck([
    slide({
      elements: [visualElement("el-a", "a"), textElement("el-text", "keep me")],
    }),
  ]);
  const result = stripOrphanedVisuals(input, new Set());

  assert.deepEqual(
    result.slides[0].elements?.map((el) => el.id),
    ["el-text"],
  );
});
