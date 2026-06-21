import assert from "node:assert/strict";
import { test } from "node:test";

import { resizeNodeBox, type NodeBox } from "@/components/visual/layout";

/** A 100×60 box centered at (200, 200); corners at (150,170)–(250,230). */
const START: NodeBox = { x: 200, y: 200, width: 100, height: 60 };
const MIN = { w: 40, h: 24 };
const BOUNDS = { width: 760, height: 480 };

function base(overrides: Partial<Parameters<typeof resizeNodeBox>[0]> = {}) {
  return resizeNodeBox({
    start: START,
    handle: "se",
    dx: 0,
    dy: 0,
    lockAspect: false,
    min: MIN,
    bounds: BOUNDS,
    ...overrides,
  });
}

test("zero delta leaves the box unchanged", () => {
  const r = base();
  assert.deepEqual(r, { x: 200, y: 200, width: 100, height: 60 });
});

test("SE handle grows width/height and pins the NW corner", () => {
  const r = base({ handle: "se", dx: 20, dy: 10 });
  assert.equal(r.width, 120);
  assert.equal(r.height, 70);
  // NW corner (left=150, top=170) stays fixed.
  assert.equal(r.x - r.width / 2, 150);
  assert.equal(r.y - r.height / 2, 170);
});

test("NW handle pins the SE corner", () => {
  const r = base({ handle: "nw", dx: -20, dy: -10 });
  // Dragging NW outward (up-left) enlarges the box.
  assert.equal(r.width, 120);
  assert.equal(r.height, 70);
  // SE corner (right=250, bottom=230) stays fixed.
  assert.equal(r.x + r.width / 2, 250);
  assert.equal(r.y + r.height / 2, 230);
});

test("NE handle pins the SW corner", () => {
  const r = base({ handle: "ne", dx: 20, dy: -10 });
  assert.equal(r.width, 120);
  assert.equal(r.height, 70);
  // SW corner (left=150, bottom=230) stays fixed.
  assert.equal(r.x - r.width / 2, 150);
  assert.equal(r.y + r.height / 2, 230);
});

test("SW handle pins the NE corner", () => {
  const r = base({ handle: "sw", dx: -20, dy: 10 });
  assert.equal(r.width, 120);
  assert.equal(r.height, 70);
  // NE corner (right=250, top=170) stays fixed.
  assert.equal(r.x + r.width / 2, 250);
  assert.equal(r.y - r.height / 2, 170);
});

test("center is re-derived from the new box", () => {
  const r = base({ handle: "se", dx: 40, dy: 20 });
  // New box: left=150,right=290,top=170,bottom=250 → center (220, 210).
  assert.equal(r.x, 220);
  assert.equal(r.y, 210);
  assert.equal(r.width, 140);
  assert.equal(r.height, 80);
});

test("min-size clamp prevents shrinking below the floor (no flip)", () => {
  // Drag SE far up-left, well past the pinned NW corner.
  const r = base({ handle: "se", dx: -500, dy: -500 });
  assert.equal(r.width, MIN.w);
  assert.equal(r.height, MIN.h);
  // NW corner still pinned; box does not flip across it.
  assert.equal(r.x - r.width / 2, 150);
  assert.equal(r.y - r.height / 2, 170);
});

test("min clamp applies per-axis independently", () => {
  // Shrink width below min but grow height.
  const r = base({ handle: "se", dx: -500, dy: 40 });
  assert.equal(r.width, MIN.w);
  assert.equal(r.height, 100);
});

test("canvas-bounds clamp caps growth at the right/bottom edges", () => {
  // SE pins NW (left=150, top=170). Max width = 760-150=610, max height=480-170=310.
  const r = base({ handle: "se", dx: 10000, dy: 10000 });
  assert.equal(r.width, 610);
  assert.equal(r.height, 310);
  // Right/bottom edges sit exactly on the bounds.
  assert.equal(r.x + r.width / 2, 760);
  assert.equal(r.y + r.height / 2, 480);
});

test("canvas-bounds clamp caps growth at the left/top edges", () => {
  // NW pins SE (right=250, bottom=230). Max width=250, max height=230.
  const r = base({ handle: "nw", dx: -10000, dy: -10000 });
  assert.equal(r.width, 250);
  assert.equal(r.height, 230);
  assert.equal(r.x - r.width / 2, 0);
  assert.equal(r.y - r.height / 2, 0);
});

test("Shift aspect-lock preserves the start ratio (width-driven)", () => {
  // Start ratio 100/60. Large dx, tiny dy → width drives, height follows.
  const r = base({ handle: "se", dx: 50, dy: 1, lockAspect: true });
  assert.equal(r.width, 150);
  assert.ok(Math.abs(r.width / r.height - 100 / 60) < 1e-9);
  assert.ok(Math.abs(r.height - 90) < 1e-9);
});

test("Shift aspect-lock preserves the start ratio (height-driven)", () => {
  // Tiny dx, large dy → height drives, width follows.
  const r = base({ handle: "se", dx: 1, dy: 60, lockAspect: true });
  assert.equal(r.height, 120);
  assert.ok(Math.abs(r.width / r.height - 100 / 60) < 1e-9);
  assert.ok(Math.abs(r.width - 200) < 1e-9);
});

test("aspect-lock keeps the pinned corner fixed", () => {
  const r = base({ handle: "se", dx: 50, dy: 1, lockAspect: true });
  assert.equal(r.x - r.width / 2, 150);
  assert.equal(r.y - r.height / 2, 170);
});

test("aspect-lock respects the min-size floor while keeping ratio", () => {
  const r = base({ handle: "se", dx: -500, dy: -500, lockAspect: true });
  // Both dims clamped up to satisfy min while preserving ratio (100/60).
  assert.ok(r.width >= MIN.w - 1e-9);
  assert.ok(r.height >= MIN.h - 1e-9);
  assert.ok(Math.abs(r.width / r.height - 100 / 60) < 1e-9);
});

test("aspect-lock scales both dims down to fit canvas bounds", () => {
  const r = base({ handle: "se", dx: 10000, dy: 10000, lockAspect: true });
  // Must fit within max width 610 / max height 310 keeping ratio.
  assert.ok(r.width <= 610 + 1e-9);
  assert.ok(r.height <= 310 + 1e-9);
  assert.ok(Math.abs(r.width / r.height - 100 / 60) < 1e-9);
});
