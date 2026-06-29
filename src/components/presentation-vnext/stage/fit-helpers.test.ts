import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canvasPctToContainerPx,
  containerPxToCanvasPct,
  fitCanvasToContainer,
} from "./fit-helpers";

function assertAlmostEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 0.000001);
}

test("fitCanvasToContainer keeps a 16:9 canvas inside padded stage bounds", () => {
  const fit = fitCanvasToContainer(1000, 700, 1600, 900, 40);
  const scaledWidth = 1600 * fit.scale;
  const scaledHeight = 900 * fit.scale;

  assertAlmostEqual(fit.scale, 0.575);
  assertAlmostEqual(scaledWidth, 920);
  assertAlmostEqual(scaledHeight, 517.5);
  assertAlmostEqual(fit.offsetX, 40);
  assertAlmostEqual(fit.offsetY, 91.25);
});

test("fitCanvasToContainer keeps the canvas visible in a narrow editor stage", () => {
  const fit = fitCanvasToContainer(720, 520, 1600, 900, 24);
  const scaledWidth = 1600 * fit.scale;
  const scaledHeight = 900 * fit.scale;

  assertAlmostEqual(fit.scale, 0.42);
  assert.ok(scaledWidth <= 720 - 48);
  assert.ok(scaledHeight <= 520 - 48);
  assert.ok(fit.offsetX >= 24);
  assert.ok(fit.offsetY >= 24);
});

test("canvas percent and container pixel conversions round-trip through the stage fit", () => {
  const fit = fitCanvasToContainer(960, 600, 1600, 900, 30);
  const point = canvasPctToContainerPx(25, 75, 1600, 900, fit);
  const pct = containerPxToCanvasPct(point.x, point.y, 1600, 900, fit);

  assert.equal(pct.x, 25);
  assert.equal(pct.y, 75);
});
