import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox } from "./deck";
import { snapBox } from "./element-snap";

const THRESHOLD = 1.5;

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

test("snapBox snaps a near left edge to another element's left edge", () => {
  const moving = box(10.8, 42, 20, 10);
  const other = box(10, 5, 30, 10);
  const { box: snapped, guides } = snapBox(moving, [other], THRESHOLD);

  assert.equal(snapped.x, 10);
  assert.equal(snapped.y, 42); // y untouched (no near target)
  assert.deepEqual(guides, [{ axis: "x", position: 10 }]);
});

test("snapBox snaps the moving center to the slide center (50)", () => {
  // Center is at 39 + 20/2 = 49 → within 1.5 of 50.
  const moving = box(39, 60, 20, 10);
  const { box: snapped, guides } = snapBox(moving, [], THRESHOLD);

  assert.equal(snapped.x + snapped.w / 2, 50);
  assert.deepEqual(guides, [{ axis: "x", position: 50 }]);
});

test("snapBox does not snap beyond the threshold", () => {
  const moving = box(15, 60, 20, 10);
  const other = box(60, 5, 30, 10);
  const { box: snapped, guides } = snapBox(moving, [other], THRESHOLD);

  assert.equal(snapped.x, 15); // unchanged
  assert.equal(snapped.y, 60);
  assert.deepEqual(guides, []);
});

test("snapBox snaps both axes and reports both guides", () => {
  const moving = box(0.5, 0.7, 20, 10); // both edges near slide origin (0)
  const { box: snapped, guides } = snapBox(moving, [], THRESHOLD);

  assert.equal(snapped.x, 0);
  assert.equal(snapped.y, 0);
  assert.equal(guides.length, 2);
  assert.ok(guides.some((g) => g.axis === "x" && g.position === 0));
  assert.ok(guides.some((g) => g.axis === "y" && g.position === 0));
});

test("snapBox snaps the trailing edge to the slide's right edge (100)", () => {
  // Trailing edge at 79.2 + 20 = 99.2 → within 1.5 of 100.
  const moving = box(79.2, 30, 20, 10);
  const { box: snapped, guides } = snapBox(moving, [], THRESHOLD);

  assert.equal(snapped.x + snapped.w, 100);
  assert.deepEqual(guides, [{ axis: "x", position: 100 }]);
});

test("snapBox picks the closest target when several are within threshold", () => {
  const moving = box(9.4, 40, 20, 10); // left edge 9.4
  // Two candidate left edges: 10 (dist .6) and 8.5 (dist .9). Closest is 10.
  const others = [box(10, 5, 5, 5), box(8.5, 70, 5, 5)];
  const { box: snapped } = snapBox(moving, others, THRESHOLD);

  assert.equal(snapped.x, 10);
});

test("snapBox returns the box unchanged with no near targets", () => {
  const moving = box(33.3, 30, 12, 9);
  const { box: snapped, guides } = snapBox(moving, [], THRESHOLD);

  assert.deepEqual(snapped, moving);
  assert.deepEqual(guides, []);
});
