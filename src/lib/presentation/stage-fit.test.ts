import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_SCREEN_SIZE,
  SLIDE_ASPECT_RATIO,
  defaultScreenSize,
  fitAspectRatio,
} from "./stage-fit";
import { slideAspectRatio } from "./slide-format";

test("SLIDE_ASPECT_RATIO is the fixed 16:9 slide ratio", () => {
  assert.equal(SLIDE_ASPECT_RATIO, 16 / 9);
});

test("fitAspectRatio height-limits a 16:9 box inside wide bounds", () => {
  // Bounds wider than 16:9 → limited by height, width = height * 16/9.
  const fitted = fitAspectRatio(
    { width: 1600, height: 600 },
    SLIDE_ASPECT_RATIO,
  );
  assert.equal(fitted.height, 600);
  assert.equal(fitted.width, 600 * (16 / 9));
  assert.ok(fitted.width <= 1600);
});

test("fitAspectRatio width-limits a 16:9 box inside tall/portrait bounds (issue #256)", () => {
  // Portrait phone bounds measured at 390px width: 358×780. The stage must NOT
  // become a tall 358×780 box (which exploded cqh text); it must letterbox to
  // 358 × ~201, fitting the width.
  const fitted = fitAspectRatio(
    { width: 358, height: 780 },
    SLIDE_ASPECT_RATIO,
  );
  assert.equal(fitted.width, 358);
  assert.equal(fitted.height, 358 / (16 / 9));
  assert.ok(Math.abs(fitted.height - 201.375) < 0.001);
  assert.ok(fitted.height < 780);
});

test("fitAspectRatio falls back to DEFAULT_SCREEN_SIZE on degenerate bounds", () => {
  assert.deepEqual(
    fitAspectRatio({ width: 0, height: 0 }, SLIDE_ASPECT_RATIO),
    DEFAULT_SCREEN_SIZE,
  );
  assert.deepEqual(
    fitAspectRatio({ width: -10, height: 100 }, SLIDE_ASPECT_RATIO),
    DEFAULT_SCREEN_SIZE,
  );
});

test("slideAspectRatio supports 4:3 slide format", () => {
  assert.equal(slideAspectRatio("4:3"), 4 / 3);
  assert.deepEqual(defaultScreenSize("4:3"), { width: 4, height: 3 });
});

test("fitAspectRatio letterboxes a 4:3 slide inside wide and tall bounds", () => {
  const ratio = slideAspectRatio("4:3");
  const wide = fitAspectRatio({ width: 1200, height: 600 }, ratio);
  assert.equal(wide.height, 600);
  assert.equal(wide.width, 800);

  const tall = fitAspectRatio({ width: 360, height: 800 }, ratio);
  assert.equal(tall.width, 360);
  assert.equal(tall.height, 270);
});
