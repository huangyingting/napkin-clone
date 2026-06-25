import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlideElement } from "./deck";
import {
  effectiveSelectedElementId,
  effectiveSelectedElementIds,
  selectedElementIdList,
  selectionAfterSet,
  selectionAfterToggle,
} from "./slide-selection";

const elements = [
  {
    id: "a",
    kind: "text",
    text: "A",
    role: "body",
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex: 0,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
  },
  {
    id: "b",
    kind: "text",
    text: "B",
    role: "body",
    box: { x: 10, y: 0, w: 10, h: 10 },
    zIndex: 1,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
  },
] satisfies SlideElement[];

test("effective selection drops missing primary ids", () => {
  assert.equal(effectiveSelectedElementId("a", elements), "a");
  assert.equal(effectiveSelectedElementId("missing", elements), null);
});

test("effective multi-selection preserves slide element order", () => {
  assert.deepEqual(
    [...effectiveSelectedElementIds(new Set(["b", "missing", "a"]), elements)],
    ["a", "b"],
  );
});

test("selectedElementIdList falls back to the primary id", () => {
  assert.deepEqual(selectedElementIdList("a", new Set()), ["a"]);
  assert.deepEqual(selectedElementIdList("a", new Set(["a", "b"])), ["a", "b"]);
  assert.deepEqual(selectedElementIdList(null, new Set(["a"])), []);
});

test("selectionAfterToggle promotes a remaining member when primary is removed", () => {
  const next = selectionAfterToggle("a", new Set(["a", "b"]), "a");
  assert.equal(next.primaryId, "b");
  assert.deepEqual([...next.ids], ["b"]);
});

test("selectionAfterSet unions additive marquee selections", () => {
  const next = selectionAfterSet("a", new Set(["a"]), ["b"], true);
  assert.equal(next.primaryId, "a");
  assert.deepEqual([...next.ids], ["a", "b"]);
});
