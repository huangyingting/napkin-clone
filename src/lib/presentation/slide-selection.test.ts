import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveSlideElementId,
  effectiveSlideElementIds,
  slideSelectionIdList,
} from "./slide-selection";
import type { SlideElement } from "./deck";

const elements = [
  {
    id: "a",
    kind: "text",
    role: "body",
    text: "A",
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
    zIndex: 0,
  },
  {
    id: "b",
    kind: "text",
    role: "body",
    text: "B",
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
    zIndex: 1,
  },
] satisfies SlideElement[];

test("effectiveSlideElementId keeps only ids on the active slide", () => {
  assert.equal(effectiveSlideElementId(elements, "a"), "a");
  assert.equal(effectiveSlideElementId(elements, "missing"), null);
  assert.equal(effectiveSlideElementId(undefined, "a"), null);
});

test("effectiveSlideElementIds preserves slide order and prunes stale ids", () => {
  assert.deepEqual(
    [...effectiveSlideElementIds(elements, new Set(["missing", "b", "a"]))],
    ["a", "b"],
  );
});

test("slideSelectionIdList falls back to the primary selection", () => {
  assert.deepEqual(slideSelectionIdList("a", new Set()), ["a"]);
  assert.deepEqual(slideSelectionIdList("a", new Set(["b", "a"])), ["b", "a"]);
  assert.deepEqual(slideSelectionIdList(null, new Set(["a"])), []);
});
