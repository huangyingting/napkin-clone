import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox } from "./deck";
import { alignBoxes } from "./element-align";

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

// A reusable spread-out selection: three boxes of differing sizes/positions.
// Bounding box: minX=10, minY=5, maxX=70 (40+30), maxY=60 (50+10).
function selection(): ElementBox[] {
  return [box(10, 5, 20, 10), box(30, 20, 40, 20), box(50, 50, 15, 10)];
}

test("alignBoxes left snaps every box to the selection's left edge", () => {
  const aligned = alignBoxes(selection(), "left");
  assert.deepEqual(
    aligned.map((b) => b.x),
    [10, 10, 10],
  );
  // y / w / h untouched.
  assert.deepEqual(
    aligned.map((b) => [b.y, b.w, b.h]),
    [
      [5, 20, 10],
      [20, 40, 20],
      [50, 15, 10],
    ],
  );
});

test("alignBoxes right snaps every box's right edge to the selection's right edge", () => {
  const aligned = alignBoxes(selection(), "right");
  // maxX = 70 → x = 70 - w.
  assert.deepEqual(
    aligned.map((b) => b.x),
    [70 - 20, 70 - 40, 70 - 15],
  );
});

test("alignBoxes hcenter centers every box on the selection's horizontal center", () => {
  const aligned = alignBoxes(selection(), "hcenter");
  // hCenter = (10 + 70) / 2 = 40.
  for (const b of aligned) {
    assert.equal(b.x + b.w / 2, 40);
  }
});

test("alignBoxes top snaps every box to the selection's top edge", () => {
  const aligned = alignBoxes(selection(), "top");
  assert.deepEqual(
    aligned.map((b) => b.y),
    [5, 5, 5],
  );
});

test("alignBoxes bottom snaps every box's bottom edge to the selection's bottom edge", () => {
  const aligned = alignBoxes(selection(), "bottom");
  // maxY = 60 → y = 60 - h.
  assert.deepEqual(
    aligned.map((b) => b.y),
    [60 - 10, 60 - 20, 60 - 10],
  );
});

test("alignBoxes vmiddle centers every box on the selection's vertical middle", () => {
  const aligned = alignBoxes(selection(), "vmiddle");
  // vMiddle = (5 + 60) / 2 = 32.5.
  for (const b of aligned) {
    assert.equal(b.y + b.h / 2, 32.5);
  }
});

test("alignBoxes is a no-op for a single-box selection", () => {
  const single = [box(12, 34, 20, 10)];
  for (const mode of [
    "left",
    "hcenter",
    "right",
    "top",
    "vmiddle",
    "bottom",
  ] as const) {
    assert.deepEqual(alignBoxes(single, mode), [box(12, 34, 20, 10)]);
  }
});

test("alignBoxes returns an empty array for an empty selection", () => {
  assert.deepEqual(alignBoxes([], "left"), []);
});

test("alignBoxes does not mutate the input boxes or array", () => {
  const input = selection();
  const snapshot = input.map((b) => ({ ...b }));
  const aligned = alignBoxes(input, "left");
  // Input untouched.
  assert.deepEqual(input, snapshot);
  // Returned boxes are new objects.
  aligned.forEach((b, i) => assert.notEqual(b, input[i]));
});
