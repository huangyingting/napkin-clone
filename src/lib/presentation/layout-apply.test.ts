/** Unit tests for layout-apply.ts after layout-slot removal. */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LayoutPlaceholder, SlideElement, SlideLayout } from "./deck";
import {
  applyLayoutPreservingContent,
  resetLayoutPositions,
} from "./layout-apply";

function placeholder(
  placeholderType: LayoutPlaceholder["placeholderType"],
): LayoutPlaceholder {
  return {
    id: `region-${placeholderType}`,
    placeholderType,
    zIndex: 0,
    box: { x: 8, y: 6, w: 84, h: 14 },
  };
}

function layout(): SlideLayout {
  return {
    id: "L1",
    name: "title-content",
    format: "16:9",
    placeholders: [placeholder("title"), placeholder("body")],
  };
}

function textElement(): SlideElement {
  return {
    id: "text-1",
    kind: "text",
    text: "Keep me",
    paragraphs: [{ text: "Keep me" }],
    zIndex: 0,
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  };
}

test("applyLayoutPreservingContent leaves authored elements unchanged", () => {
  const element = textElement();
  const result = applyLayoutPreservingContent([element], layout());

  assert.deepStrictEqual(result.elements, [element]);
  assert.deepStrictEqual(result.moved, []);
  assert.deepStrictEqual(result.inserted, []);
});

test("applyLayoutPreservingContent does not insert placeholder elements for empty regions", () => {
  const result = applyLayoutPreservingContent([], layout());

  assert.deepStrictEqual(result.elements, []);
  assert.deepStrictEqual(result.moved, []);
  assert.deepStrictEqual(result.inserted, []);
});

test("resetLayoutPositions is a no-op without stored layout slots", () => {
  const element = textElement();
  const result = resetLayoutPositions([element], layout());

  assert.deepStrictEqual(result.elements, [element]);
  assert.deepStrictEqual(result.moved, []);
});
