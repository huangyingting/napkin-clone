import assert from "node:assert/strict";
import { test } from "node:test";

import { clampToolbarLeft } from "./toolbar-position";

test("clampToolbarLeft keeps an in-bounds position untouched on a normal stage", () => {
  // Wide stage, selection centered: the requested left is well inside the
  // [margin, width - margin] window, so it is returned unchanged.
  assert.equal(clampToolbarLeft(480, 960, 120), 480);
});

test("clampToolbarLeft clamps to the margin near the edges of a normal stage", () => {
  assert.equal(clampToolbarLeft(10, 960, 120), 120);
  assert.equal(clampToolbarLeft(950, 960, 120), 960 - 120);
});

test("clampToolbarLeft keeps the toolbar fully within [0, width] on a narrow stage", () => {
  const width = 200; // < 2 * margin (240): the old clamp pinned off-canvas.
  for (const leftPx of [-50, 0, 30, 100, 180, 250]) {
    const clamped = clampToolbarLeft(leftPx, width, 120);
    assert.ok(
      clamped >= 0 && clamped <= width,
      `expected ${clamped} within [0, ${width}] for leftPx=${leftPx}`,
    );
  }
});

test("clampToolbarLeft centers the toolbar when the margin inverts the window", () => {
  // margin (120) > width / 2 (90): min would exceed max with a fixed clamp.
  // The effective margin collapses to width / 2 so the toolbar centers.
  assert.equal(clampToolbarLeft(10, 180, 120), 90);
  assert.equal(clampToolbarLeft(170, 180, 120), 90);
  assert.equal(clampToolbarLeft(90, 180, 120), 90);
});

test("clampToolbarLeft handles the element toolbar margin (90px) on a narrow stage", () => {
  const width = 150; // < 2 * 90.
  const clamped = clampToolbarLeft(140, width, 90);
  assert.equal(clamped, width / 2);
  assert.ok(clamped >= 0 && clamped <= width);
});

test("clampToolbarLeft is safe for zero and negative widths", () => {
  assert.equal(clampToolbarLeft(50, 0, 120), 0);
  assert.equal(clampToolbarLeft(50, -10, 120), 0);
});
