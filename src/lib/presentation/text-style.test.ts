import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALIGN_OPTIONS,
  clampFontSize,
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  stepFontSize,
  themeSwatchColors,
} from "./text-style";

test("clampFontSize snaps to the nearest step", () => {
  assert.equal(clampFontSize(4.2), 4);
  assert.equal(clampFontSize(4.3), 4.5);
  assert.equal(clampFontSize(4.75), 5);
});

test("clampFontSize keeps values inside the bounds", () => {
  assert.equal(clampFontSize(-10), FONT_MIN);
  assert.equal(clampFontSize(0), FONT_MIN);
  assert.equal(clampFontSize(1000), FONT_MAX);
  assert.equal(clampFontSize(FONT_MIN), FONT_MIN);
  assert.equal(clampFontSize(FONT_MAX), FONT_MAX);
});

test("clampFontSize falls back to the minimum for non-finite input", () => {
  assert.equal(clampFontSize(Number.NaN), FONT_MIN);
  assert.equal(clampFontSize(Number.POSITIVE_INFINITY), FONT_MIN);
  assert.equal(clampFontSize(Number.NEGATIVE_INFINITY), FONT_MIN);
});

test("stepFontSize applies a delta then snaps and clamps", () => {
  assert.equal(stepFontSize(4, FONT_STEP), 4.5);
  assert.equal(stepFontSize(4, -FONT_STEP), 3.5);
  assert.equal(stepFontSize(FONT_MIN, -FONT_STEP), FONT_MIN);
  assert.equal(stepFontSize(FONT_MAX, FONT_STEP), FONT_MAX);
});

test("ALIGN_OPTIONS lists the three alignments in order", () => {
  assert.deepEqual([...ALIGN_OPTIONS], ["left", "center", "right"]);
});

test("themeSwatchColors extracts a deduped, ordered list for a key", () => {
  const themes = {
    a: { accentColor: "#111111", bgColor: "#000000" },
    b: { accentColor: "#222222", bgColor: "#000000" },
    c: { accentColor: "#111111", bgColor: "#abcdef" },
  };
  assert.deepEqual(themeSwatchColors(themes, "accentColor"), [
    "#111111",
    "#222222",
  ]);
  assert.deepEqual(themeSwatchColors(themes, "bgColor"), [
    "#000000",
    "#abcdef",
  ]);
});

test("themeSwatchColors dedupes case-insensitively, keeping first casing", () => {
  const themes = {
    a: { accentColor: "#ABCDEF" },
    b: { accentColor: "#abcdef" },
  };
  assert.deepEqual(themeSwatchColors(themes, "accentColor"), ["#ABCDEF"]);
});

test("themeSwatchColors skips non-string values", () => {
  const themes = {
    a: { accentColor: "#111111", weight: 1 },
    b: { accentColor: "#222222", weight: 2 },
  } as unknown as Record<string, Record<string, string>>;
  assert.deepEqual(themeSwatchColors(themes, "weight"), []);
});
