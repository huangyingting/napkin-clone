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

// ── distributeBoxes ──────────────────────────────────────────────────────────

// Three boxes side-by-side with unequal gaps.
// A: x=0 w=10  → right edge 10
// B: x=20 w=10 → right edge 30  (gap-before: 10)
// C: x=50 w=10 → right edge 60  (gap-before: 20)
// Total width = 30. Available span = 0..60. Gaps = (60-30)/(3-1) = 15.
// Expected x-positions after distribute: A=0, B=0+10+15=25, C=25+10+15=50.
function threeH(): ElementBox[] {
  return [box(0, 5, 10, 8), box(20, 5, 10, 8), box(50, 5, 10, 8)];
}

test("distributeBoxes horizontal spaces three boxes evenly", () => {
  const result = distributeBoxes(threeH(), "horizontal");
  assert.equal(result.length, 3);
  // Anchor: leftmost x=0 stays, rightmost x=50 stays.
  assert.equal(result.find((b) => b.x === 0) != null, true);
  assert.equal(result.find((b) => b.x === 50) != null, true);
  // Middle box repositioned to x=25.
  assert.equal(result.find((b) => Math.abs(b.x - 25) < 0.001) != null, true);
  // y / w / h never changed.
  for (const b of result) {
    assert.equal(b.y, 5);
    assert.equal(b.w, 10);
    assert.equal(b.h, 8);
  }
});

// Three boxes stacked vertically with unequal gaps.
// A: y=0 h=10, B: y=25 h=10, C: y=60 h=10
// Span = 0..70. Total height = 30. Gaps = (70-30)/2 = 20.
// Expected y: A=0, B=0+10+20=30, C=30+10+20=60.
function threeV(): ElementBox[] {
  return [box(5, 0, 8, 10), box(5, 25, 8, 10), box(5, 60, 8, 10)];
}

test("distributeBoxes vertical spaces three boxes evenly", () => {
  const result = distributeBoxes(threeV(), "vertical");
  assert.equal(result.find((b) => b.y === 0) != null, true);
  assert.equal(result.find((b) => b.y === 60) != null, true);
  assert.equal(result.find((b) => Math.abs(b.y - 30) < 0.001) != null, true);
  // x / w / h never changed.
  for (const b of result) {
    assert.equal(b.x, 5);
    assert.equal(b.w, 8);
    assert.equal(b.h, 10);
  }
});

test("distributeBoxes is a no-op (returns input) when fewer than 3 boxes", () => {
  const two = [box(0, 0, 10, 10), box(50, 0, 10, 10)];
  assert.strictEqual(distributeBoxes(two, "horizontal"), two);
  assert.strictEqual(distributeBoxes(two, "vertical"), two);
  const one = [box(0, 0, 10, 10)];
  assert.strictEqual(distributeBoxes(one, "horizontal"), one);
  const zero: ElementBox[] = [];
  assert.strictEqual(distributeBoxes(zero, "horizontal"), zero);
});

test("distributeBoxes does not mutate the input boxes", () => {
  const input = threeH();
  const snapshot = input.map((b) => ({ ...b }));
  distributeBoxes(input, "horizontal");
  assert.deepEqual(input, snapshot);
});

// ── matchSizeBoxes ──────────────────────────────────────────────────────────

function threeBoxes(): ElementBox[] {
  return [box(10, 10, 30, 20), box(50, 50, 10, 5), box(80, 80, 40, 40)];
}

test("matchSizeBoxes width copies first box width to all", () => {
  const result = matchSizeBoxes(threeBoxes(), "width");
  for (const b of result) {
    assert.equal(b.w, 30); // first box w
  }
  // Heights unchanged.
  assert.deepEqual(
    result.map((b) => b.h),
    [20, 5, 40],
  );
  // Positions unchanged.
  assert.deepEqual(
    result.map((b) => b.x),
    [10, 50, 80],
  );
});

test("matchSizeBoxes height copies first box height to all", () => {
  const result = matchSizeBoxes(threeBoxes(), "height");
  for (const b of result) {
    assert.equal(b.h, 20); // first box h
  }
  // Widths unchanged.
  assert.deepEqual(
    result.map((b) => b.w),
    [30, 10, 40],
  );
});

test("matchSizeBoxes both copies first box w and h to all", () => {
  const result = matchSizeBoxes(threeBoxes(), "both");
  for (const b of result) {
    assert.equal(b.w, 30);
    assert.equal(b.h, 20);
  }
  // Positions unchanged.
  assert.deepEqual(
    result.map((b) => b.x),
    [10, 50, 80],
  );
  assert.deepEqual(
    result.map((b) => b.y),
    [10, 50, 80],
  );
});

test("matchSizeBoxes returns empty array for empty input", () => {
  assert.deepEqual(matchSizeBoxes([], "both"), []);
});

test("matchSizeBoxes does not mutate input boxes", () => {
  const input = threeBoxes();
  const snapshot = input.map((b) => ({ ...b }));
  matchSizeBoxes(input, "both");
  assert.deepEqual(input, snapshot);
});
