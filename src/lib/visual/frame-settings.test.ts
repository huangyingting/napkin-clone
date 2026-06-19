/**
 * Tests for the pure frame-settings helpers:
 *  - computeLetterboxedDimensions (aspect-ratio presets)
 *  - applyAspectRatioToSvg (SVG string transform)
 *  - computePageBreaks (page-break offsets for A4 / Letter / 16:9)
 *
 * These tests run under `node --test` without a browser.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeLetterboxedDimensions,
  applyAspectRatioToSvg,
  ASPECT_RATIO_VALUES,
} from "@/lib/visual/export-options";
import {
  computePageBreaks,
  PAGE_SIZE_DIMENSIONS,
} from "@/lib/visual/document-export";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViewBox(width: number, height: number) {
  return { width, height };
}

const SVG_760_480 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 480" width="760" height="480"><rect x="0" y="0" width="760" height="480" fill="#ffffff"/><circle cx="380" cy="240" r="50" fill="#6366f1"/></svg>`;
const SVG_480_480 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" width="480" height="480"><rect x="0" y="0" width="480" height="480" fill="#eeeeee"/></svg>`;

// ---------------------------------------------------------------------------
// computeLetterboxedDimensions — "auto"
// ---------------------------------------------------------------------------

test("auto preset: canvas equals natural viewBox dimensions, no offset", () => {
  const result = computeLetterboxedDimensions(makeViewBox(760, 480), "auto");
  assert.equal(result.canvasW, 760);
  assert.equal(result.canvasH, 480);
  assert.equal(result.offsetX, 0);
  assert.equal(result.offsetY, 0);
});

test("undefined preset: same as auto — no change", () => {
  const result = computeLetterboxedDimensions(makeViewBox(760, 480), undefined);
  assert.equal(result.canvasW, 760);
  assert.equal(result.canvasH, 480);
  assert.equal(result.offsetX, 0);
  assert.equal(result.offsetY, 0);
});

// ---------------------------------------------------------------------------
// computeLetterboxedDimensions — 16:9
// ---------------------------------------------------------------------------

test("16:9 on a wider-than-target content (760×480 ≈ 1.58:1 < 16/9 ≈ 1.78): letterboxes width", () => {
  // 760/480 ≈ 1.583, 16/9 ≈ 1.778 → content is shorter than target → extend width
  const result = computeLetterboxedDimensions(makeViewBox(760, 480), "16:9");
  const expectedW = 480 * ASPECT_RATIO_VALUES["16:9"];
  assert.ok(
    Math.abs(result.canvasW - expectedW) < 0.01,
    `canvasW should be ~${expectedW}, got ${result.canvasW}`,
  );
  assert.equal(result.canvasH, 480, "canvasH should stay 480");
  assert.ok(result.offsetX > 0, "offsetX should be positive (pillarbox)");
  assert.equal(result.offsetY, 0, "offsetY should be 0");
});

test("16:9 on a 16:9 content: no change, offsets are 0", () => {
  const w = 1280;
  const h = 720;
  const result = computeLetterboxedDimensions(makeViewBox(w, h), "16:9");
  assert.ok(
    Math.abs(result.canvasW - w) < 0.01,
    "canvasW should equal natural width",
  );
  assert.ok(
    Math.abs(result.canvasH - h) < 0.01,
    "canvasH should equal natural height",
  );
  assert.ok(
    Math.abs(result.offsetX) < 0.01,
    "offsetX should be ~0 for already-correct ratio",
  );
  assert.ok(
    Math.abs(result.offsetY) < 0.01,
    "offsetY should be ~0 for already-correct ratio",
  );
});

test("16:9 on a wider content (2400×480 ≈ 5:1): pillarboxes height", () => {
  // 2400/480 = 5 > 16/9 → content is wider than target → extend height
  const result = computeLetterboxedDimensions(makeViewBox(2400, 480), "16:9");
  assert.equal(result.canvasW, 2400, "canvasW stays 2400");
  const expectedH = 2400 / ASPECT_RATIO_VALUES["16:9"];
  assert.ok(
    Math.abs(result.canvasH - expectedH) < 0.01,
    `canvasH should be ~${expectedH}`,
  );
  assert.equal(result.offsetX, 0, "offsetX should be 0");
  assert.ok(result.offsetY > 0, "offsetY should be positive (letterbox)");
});

// ---------------------------------------------------------------------------
// computeLetterboxedDimensions — 1:1
// ---------------------------------------------------------------------------

test("1:1 on a landscape viewBox (760×480): square with top/bottom bar", () => {
  const result = computeLetterboxedDimensions(makeViewBox(760, 480), "1:1");
  // 760/480 > 1 → extend height to 760
  assert.equal(result.canvasW, 760, "canvasW stays 760");
  assert.equal(result.canvasH, 760, "canvasH becomes 760 to make it square");
  assert.equal(result.offsetX, 0);
  assert.ok(result.offsetY > 0, "offsetY adds top-padding");
  assert.ok(
    Math.abs(result.offsetY - (760 - 480) / 2) < 0.01,
    "offsetY should be (760-480)/2",
  );
});

test("1:1 on a portrait viewBox (480×760): square with left/right bar", () => {
  const result = computeLetterboxedDimensions(makeViewBox(480, 760), "1:1");
  // 480/760 < 1 → extend width to 760
  assert.equal(result.canvasH, 760, "canvasH stays 760");
  assert.equal(result.canvasW, 760, "canvasW becomes 760 to make it square");
  assert.equal(result.offsetY, 0);
  assert.ok(result.offsetX > 0, "offsetX adds left-padding");
});

test("1:1 on a square viewBox: no change", () => {
  const result = computeLetterboxedDimensions(makeViewBox(500, 500), "1:1");
  assert.equal(result.canvasW, 500);
  assert.equal(result.canvasH, 500);
  assert.equal(result.offsetX, 0);
  assert.equal(result.offsetY, 0);
});

// ---------------------------------------------------------------------------
// computeLetterboxedDimensions — 4:5
// ---------------------------------------------------------------------------

test("4:5 on a landscape viewBox (760×480): bars on left/right", () => {
  // 760/480 ≈ 1.583 > 4/5 = 0.8 → content is wider → extend height
  const result = computeLetterboxedDimensions(makeViewBox(760, 480), "4:5");
  assert.equal(result.canvasW, 760, "canvasW stays 760");
  const expectedH = 760 / ASPECT_RATIO_VALUES["4:5"]; // 760 / 0.8 = 950
  assert.ok(Math.abs(result.canvasH - expectedH) < 0.01, "canvasH = 950");
  assert.equal(result.offsetX, 0);
  assert.ok(result.offsetY > 0, "offsetY should be positive");
});

// ---------------------------------------------------------------------------
// applyAspectRatioToSvg
// ---------------------------------------------------------------------------

test("applyAspectRatioToSvg: 'auto' returns the SVG unchanged", () => {
  const result = applyAspectRatioToSvg(SVG_760_480, "auto");
  assert.equal(result, SVG_760_480);
});

test("applyAspectRatioToSvg: undefined returns the SVG unchanged", () => {
  const result = applyAspectRatioToSvg(SVG_760_480, undefined);
  assert.equal(result, SVG_760_480);
});

test("applyAspectRatioToSvg: 1:1 on landscape expands the viewBox height", () => {
  const result = applyAspectRatioToSvg(SVG_760_480, "1:1");
  assert.ok(
    result.includes('viewBox="0 0 760 760"'),
    "viewBox height should expand to 760 for a 1:1 square",
  );
});

test("applyAspectRatioToSvg: 1:1 injects a letterbox background rect", () => {
  const result = applyAspectRatioToSvg(SVG_760_480, "1:1");
  assert.ok(
    result.includes('data-letterbox="true"'),
    "should inject a letterbox background rect",
  );
});

test("applyAspectRatioToSvg: 1:1 wraps content in a translate group", () => {
  const result = applyAspectRatioToSvg(SVG_760_480, "1:1");
  assert.ok(
    result.includes("<g transform="),
    "content should be wrapped in a translate group",
  );
});

test("applyAspectRatioToSvg: 16:9 on a 760×480 SVG expands width", () => {
  const result = applyAspectRatioToSvg(SVG_760_480, "16:9");
  // 760/480 < 16/9, so width should be extended: canvasW = 480 * (16/9)
  const expectedW = Math.round(480 * ASPECT_RATIO_VALUES["16:9"] * 100) / 100;
  assert.ok(
    result.includes(`viewBox="0 0 ${expectedW}`),
    `viewBox should start with "0 0 ${expectedW}"`,
  );
  assert.equal(
    result.includes('viewBox="0 0 760 480"'),
    false,
    "original viewBox should be replaced",
  );
});

test("applyAspectRatioToSvg: 1:1 on a square SVG returns unchanged viewBox", () => {
  const result = applyAspectRatioToSvg(SVG_480_480, "1:1");
  // Already 1:1, so no transform needed
  assert.ok(
    result.includes('viewBox="0 0 480 480"'),
    "viewBox should not change for an already-correct ratio",
  );
  assert.ok(
    !result.includes('data-letterbox="true"'),
    "no letterbox rect should be injected for a correctly-sized canvas",
  );
});

// ---------------------------------------------------------------------------
// computePageBreaks
// ---------------------------------------------------------------------------

test("computePageBreaks: empty for zero content height", () => {
  const breaks = computePageBreaks(0, "a4");
  assert.deepEqual(breaks, []);
});

test("computePageBreaks: empty for negative content height", () => {
  const breaks = computePageBreaks(-1, "a4");
  assert.deepEqual(breaks, []);
});

test("computePageBreaks: one page of content → no breaks", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["a4"];
  const breaks = computePageBreaks(heightPx - 1, "a4");
  assert.deepEqual(breaks, [], "content shorter than one page has no breaks");
});

test("computePageBreaks: exactly one page height → no breaks", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["a4"];
  const breaks = computePageBreaks(heightPx, "a4");
  assert.deepEqual(breaks, [], "exactly one page has no split");
});

test("computePageBreaks: A4 — content of 1.5 pages produces one break", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["a4"];
  const breaks = computePageBreaks(Math.round(heightPx * 1.5), "a4");
  assert.equal(breaks.length, 1, "one break expected");
  assert.equal(breaks[0], heightPx, "break at exactly one page height");
});

test("computePageBreaks: A4 — content of 3 pages produces two breaks", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["a4"];
  const breaks = computePageBreaks(heightPx * 3 - 1, "a4");
  assert.equal(breaks.length, 2, "two breaks for ~3 pages");
  assert.equal(breaks[0], heightPx);
  assert.equal(breaks[1], heightPx * 2);
});

test("computePageBreaks: US Letter — correct page height used", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["letter"];
  const breaks = computePageBreaks(Math.round(heightPx * 2.5), "letter");
  assert.equal(breaks.length, 2, "two breaks for ~2.5 US-Letter pages");
  assert.equal(breaks[0], heightPx);
  assert.equal(breaks[1], heightPx * 2);
});

test("computePageBreaks: 16:9 — correct page height used", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["16:9"];
  const breaks = computePageBreaks(heightPx * 2 + 1, "16:9");
  assert.equal(
    breaks.length,
    2,
    "two breaks for content slightly over 2 slides",
  );
  assert.equal(breaks[0], heightPx);
  assert.equal(breaks[1], heightPx * 2);
});

test("computePageBreaks: breaks are in ascending order", () => {
  const { heightPx } = PAGE_SIZE_DIMENSIONS["a4"];
  const breaks = computePageBreaks(heightPx * 5, "a4");
  for (let i = 1; i < breaks.length; i++) {
    assert.ok(breaks[i] > breaks[i - 1], "breaks should be in ascending order");
  }
});
