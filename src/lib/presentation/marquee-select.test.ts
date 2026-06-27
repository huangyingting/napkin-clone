import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox } from "./deck";
import {
  boxesIntersectingRect,
  normalizeRect,
  type IdentifiedBox,
  type MarqueeRect,
} from "./marquee-select";

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

function rect(x: number, y: number, w: number, h: number): MarqueeRect {
  return { x, y, w, h };
}

// A superseded layout of four well-separated boxes.
function layout(): IdentifiedBox[] {
  return [
    { id: "a", box: box(10, 10, 10, 10) }, // 10..20 / 10..20
    { id: "b", box: box(40, 40, 10, 10) }, // 40..50 / 40..50
    { id: "c", box: box(70, 70, 10, 10) }, // 70..80 / 70..80
    { id: "d", box: box(10, 70, 10, 10) }, // 10..20 / 70..80
  ];
}

test("normalizeRect leaves a positive-size rect unchanged", () => {
  assert.deepEqual(normalizeRect(rect(5, 5, 20, 30)), {
    x: 5,
    y: 5,
    w: 20,
    h: 30,
  });
});

test("normalizeRect folds a rect dragged up and left into a top-left origin", () => {
  // Drag started at (50,60) and ended at (20,10): w=-30, h=-50.
  assert.deepEqual(normalizeRect(rect(50, 60, -30, -50)), {
    x: 20,
    y: 10,
    w: 30,
    h: 50,
  });
});

test("normalizeRect folds a single negative axis", () => {
  assert.deepEqual(normalizeRect(rect(50, 10, -30, 40)), {
    x: 20,
    y: 10,
    w: 30,
    h: 40,
  });
});

test("boxesIntersectingRect fully enclosing a box selects it", () => {
  const hit = boxesIntersectingRect(layout(), rect(5, 5, 20, 20));
  assert.deepEqual(hit, ["a"]);
});

test("boxesIntersectingRect partial overlap selects the box", () => {
  // Overlaps only the bottom-right corner of "a" (10..20 / 10..20).
  const hit = boxesIntersectingRect(layout(), rect(15, 15, 30, 30));
  // Also fully covers "b" (40..50).
  assert.deepEqual(hit, ["a", "b"]);
});

test("boxesIntersectingRect with no overlap selects nothing", () => {
  const hit = boxesIntersectingRect(layout(), rect(55, 5, 10, 10));
  assert.deepEqual(hit, []);
});

test("boxesIntersectingRect counts an edge-touch as a hit (inclusive)", () => {
  // Rect's right edge is exactly at x=10, the left edge of "a" and "d".
  const hit = boxesIntersectingRect(layout(), rect(0, 0, 10, 100));
  assert.deepEqual(hit, ["a", "d"]);
});

test("boxesIntersectingRect normalizes a negative-size marquee before testing", () => {
  // Same band as a positive (10,10)->(50,50) drag, but drawn bottom-right to
  // top-left: should still catch "a" and "b".
  const hit = boxesIntersectingRect(layout(), rect(50, 50, -40, -40));
  assert.deepEqual(hit, ["a", "b"]);
});

test("boxesIntersectingRect selects every enclosed box and preserves input order", () => {
  const hit = boxesIntersectingRect(layout(), rect(0, 0, 100, 100));
  assert.deepEqual(hit, ["a", "b", "c", "d"]);
});

test("boxesIntersectingRect does not mutate its inputs", () => {
  const boxes = layout();
  const snapshot = JSON.parse(JSON.stringify(boxes));
  const r = rect(50, 50, -40, -40);
  boxesIntersectingRect(boxes, r);
  assert.deepEqual(boxes, snapshot);
  assert.deepEqual(r, { x: 50, y: 50, w: -40, h: -40 });
});
