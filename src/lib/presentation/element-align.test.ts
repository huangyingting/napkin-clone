import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox } from "./deck";
import { alignBoxes, distributeBoxes, matchSizeBoxes } from "./element-align";

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

// ---------------------------------------------------------------------------
// distributeBoxes
// ---------------------------------------------------------------------------

// Three boxes arranged with uneven gaps horizontally.
// x positions: 0, 25, 80  widths: 10, 10, 10
// span = 90 (0+10 → 80+10), total width = 30, gap = (90-30)/(3-1) = 30.
// After: 0, 40, 80.
function hSpread(): ElementBox[] {
  return [box(0, 5, 10, 8), box(25, 5, 10, 8), box(80, 5, 10, 8)];
}

test("distributeBoxes horizontal spaces boxes with equal gaps", () => {
  const result = distributeBoxes(hSpread(), "horizontal");
  const xs = result.map((b) => b.x);
  assert.equal(xs[0], 0); // leftmost stays
  assert.equal(xs[2], 80); // rightmost stays
  assert.ok(Math.abs(xs[1] - 40) < 0.001, `expected ~40, got ${xs[1]}`);
  // sizes and y unchanged
  result.forEach((b) => assert.equal(b.w, 10));
  result.forEach((b) => assert.equal(b.h, 8));
  result.forEach((b) => assert.equal(b.y, 5));
});

// Three boxes arranged with uneven gaps vertically.
// y positions: 0, 30, 90  heights: 10, 10, 10
// span = 100, total height = 30, gap = 70/2 = 35. After: 0, 45, 90.
function vSpread(): ElementBox[] {
  return [box(5, 0, 8, 10), box(5, 30, 8, 10), box(5, 90, 8, 10)];
}

test("distributeBoxes vertical spaces boxes with equal gaps", () => {
  const result = distributeBoxes(vSpread(), "vertical");
  const ys = result.map((b) => b.y);
  assert.equal(ys[0], 0);
  assert.equal(ys[2], 90);
  assert.ok(Math.abs(ys[1] - 45) < 0.001, `expected ~45, got ${ys[1]}`);
});

test("distributeBoxes returns new objects for a 2-box selection (no-op)", () => {
  const two = [box(0, 0, 10, 10), box(50, 0, 10, 10)];
  const result = distributeBoxes(two, "horizontal");
  assert.deepEqual(result, two);
  two.forEach((b, i) => assert.notEqual(b, result[i]));
});

test("distributeBoxes does not mutate input", () => {
  const input = hSpread();
  const snap = input.map((b) => ({ ...b }));
  distributeBoxes(input, "horizontal");
  assert.deepEqual(input, snap);
});

test("distributeBoxes preserves input array order (unsorted input)", () => {
  // Input in reverse x order — distributed result must be in the same index order.
  const unsorted = [box(80, 0, 10, 5), box(25, 0, 10, 5), box(0, 0, 10, 5)];
  const result = distributeBoxes(unsorted, "horizontal");
  // Leftmost stays at x=0 (was index 2), rightmost at x=80 (was index 0).
  assert.equal(result[0].x, 80); // index 0 keeps original index position
  assert.equal(result[2].x, 0);
  // Middle (index 1, x=25) → x=40
  assert.ok(Math.abs(result[1].x - 40) < 0.001);
});

// ---------------------------------------------------------------------------
// matchSizeBoxes
// ---------------------------------------------------------------------------

test("matchSizeBoxes width resizes all boxes to the first box's width", () => {
  const boxes = [box(0, 0, 30, 20), box(10, 10, 10, 15), box(50, 5, 20, 25)];
  const result = matchSizeBoxes(boxes, "width");
  // First box unchanged.
  assert.deepEqual(result[0], boxes[0]);
  // Others get w=30; centers preserved.
  result.slice(1).forEach((b, idx) => {
    const orig = boxes[idx + 1];
    assert.equal(b.w, 30);
    assert.equal(b.h, orig.h);
    assert.ok(
      Math.abs(b.x + b.w / 2 - (orig.x + orig.w / 2)) < 0.001,
      "center x preserved",
    );
  });
});

test("matchSizeBoxes height resizes all boxes to the first box's height", () => {
  const boxes = [box(0, 0, 30, 20), box(10, 10, 10, 15), box(50, 5, 20, 25)];
  const result = matchSizeBoxes(boxes, "height");
  assert.deepEqual(result[0], boxes[0]);
  result.slice(1).forEach((b, idx) => {
    const orig = boxes[idx + 1];
    assert.equal(b.h, 20);
    assert.equal(b.w, orig.w);
    assert.ok(
      Math.abs(b.y + b.h / 2 - (orig.y + orig.h / 2)) < 0.001,
      "center y preserved",
    );
  });
});

test("matchSizeBoxes both resizes all boxes to first box's width and height", () => {
  const boxes = [box(0, 0, 30, 20), box(10, 10, 10, 15), box(50, 5, 20, 25)];
  const result = matchSizeBoxes(boxes, "both");
  assert.deepEqual(result[0], boxes[0]);
  result.slice(1).forEach((b) => {
    assert.equal(b.w, 30);
    assert.equal(b.h, 20);
  });
});

test("matchSizeBoxes returns new objects for a single-box selection (no-op)", () => {
  const single = [box(5, 5, 20, 10)];
  const result = matchSizeBoxes(single, "both");
  assert.deepEqual(result, single);
  assert.notEqual(result[0], single[0]);
});

test("matchSizeBoxes does not mutate input", () => {
  const input = [box(0, 0, 30, 20), box(10, 10, 10, 15)];
  const snap = input.map((b) => ({ ...b }));
  matchSizeBoxes(input, "both");
  assert.deepEqual(input, snap);
});
