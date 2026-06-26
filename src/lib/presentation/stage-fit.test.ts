import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeStageLayout,
  DEFAULT_SCREEN_SIZE,
  SLIDE_ASPECT_RATIO,
  clampZoom,
  defaultScreenSize,
  fitAspectRatio,
  MAX_ZOOM,
  MIN_ZOOM,
  percentToZoom,
  ZOOM_PERCENT_PRESETS,
  zoomToPercent,
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

test("computeStageLayout centers the slide vertically without 100% scroll", () => {
  // aspect 2 keeps the math clean. Wide-but-short stage, panel closed.
  const layout = computeStageLayout({
    stageBounds: { width: 1000, height: 600 },
    stagePaddingTop: 10,
    aspectRatio: 2,
    zoom: 1,
  });

  // avail = 1000 × 600; fit aspect-2 → 1000 × 500 (width-limited), centered.
  assert.deepEqual(layout.slide, {
    left: 0,
    top: 50,
    width: 1000,
    height: 500,
  });
  assert.deepEqual(layout.scrollContentSize, { width: 1000, height: 600 });
  assert.equal(layout.needsScroll, false);
  // Panel top = stage padding (10) + slide top (50); height matches the slide.
  assert.deepEqual(layout.inspectorPanel, { top: 60, height: 500 });
});

test("computeStageLayout shifts left for the overlay inspector without resizing", () => {
  const closed = computeStageLayout({
    stageBounds: { width: 1400, height: 600 },
    stagePaddingTop: 10,
    aspectRatio: 2,
    zoom: 1,
  });
  const open = computeStageLayout({
    stageBounds: { width: 1400, height: 600 },
    stagePaddingTop: 10,
    aspectRatio: 2,
    zoom: 1,
    inspectorOpen: true,
    inspectorShiftX: 300,
  });

  // Full-stage fit is height-limited: 1200 × 600 with 100px side gutters.
  assert.deepEqual(closed.slide, {
    left: 100,
    top: 0,
    width: 1200,
    height: 600,
  });
  assert.deepEqual(open.slide, {
    left: 0,
    top: 0,
    width: 1200,
    height: 600,
  });
  assert.deepEqual(open.scrollContentSize, closed.scrollContentSize);
  assert.equal(open.needsScroll, false);
  assert.deepEqual(open.inspectorPanel, closed.inspectorPanel);
});

test("computeStageLayout overflows into scroll only when zoomed past the stage", () => {
  const layout = computeStageLayout({
    stageBounds: { width: 800, height: 450 },
    stagePaddingTop: 8,
    aspectRatio: 2,
    zoom: 1.5,
  });

  // avail = 800 × 450; fit → 800 × 400; ×1.5 → 1200 × 600.
  assert.deepEqual(layout.slide, {
    left: 0,
    top: 0,
    width: 1200,
    height: 600,
  });
  assert.deepEqual(layout.scrollContentSize, { width: 1200, height: 600 });
  assert.equal(layout.needsScroll, true);
  // Panel height clamps to the visible stage height.
  assert.deepEqual(layout.inspectorPanel, { top: 8, height: 450 });
});

// Bottom-dock zoom controls (issue #591) — pure clamp/convert helpers.

test("ZOOM_PERCENT_PRESETS exposes the dock preset ladder", () => {
  assert.deepEqual(
    [...ZOOM_PERCENT_PRESETS],
    [25, 50, 75, 100, 125, 150, 175, 200],
  );
});

test("clampZoom limits to the supported [MIN_ZOOM, MAX_ZOOM] range", () => {
  assert.equal(clampZoom(0.05), MIN_ZOOM);
  assert.equal(clampZoom(10), MAX_ZOOM);
  assert.equal(clampZoom(1), 1);
});

test("clampZoom rounds to whole-percent precision", () => {
  assert.equal(clampZoom(1.234), 1.23);
  assert.equal(clampZoom(0.756), 0.76);
});

test("clampZoom falls back to 1 for non-finite input", () => {
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
});

test("zoomToPercent and percentToZoom round-trip preset values", () => {
  for (const percent of ZOOM_PERCENT_PRESETS) {
    assert.equal(zoomToPercent(percentToZoom(percent)), percent);
  }
});

test("percentToZoom clamps slider extremes (25% .. 200%)", () => {
  assert.equal(percentToZoom(25), MIN_ZOOM);
  assert.equal(percentToZoom(200), MAX_ZOOM);
  assert.equal(percentToZoom(10), MIN_ZOOM);
  assert.equal(percentToZoom(300), MAX_ZOOM);
});
