import assert from "node:assert/strict";
import { test } from "node:test";

import { allThemeTokenSets } from "./deck-theme-tokens";
import {
  ALIGN_OPTIONS,
  clampFontSize,
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  mergeSwatches,
  stepFontSize,
  themeSwatchColors,
  tokenSetSwatchColors,
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

test("tokenSetSwatchColors derives built-in slide background swatches from token sets", () => {
  assert.deepEqual(tokenSetSwatchColors(allThemeTokenSets(), "slideBg"), [
    "#ffffff",
    "#f6fbff",
    "#f6fdf8",
    "#fffaf5",
    "#fdf7ff",
  ]);
});

test("tokenSetSwatchColors derives built-in accent swatches from token sets", () => {
  assert.deepEqual(tokenSetSwatchColors(allThemeTokenSets(), "accent"), [
    "#6366f1",
    "#4f46e5",
    "#0284c7",
    "#16a34a",
    "#ea580c",
    "#9333ea",
  ]);
});

test("mergeSwatches keeps priority order and dedupes case-insensitively", () => {
  assert.deepEqual(
    mergeSwatches(["#FF0000", "#00ff00"], ["#00FF00", "#0000ff"]),
    ["#FF0000", "#00ff00", "#0000ff"],
  );
});

test("mergeSwatches skips nullish and non-string entries", () => {
  assert.deepEqual(
    mergeSwatches(["#111111", null, undefined], undefined, ["#222222"]),
    ["#111111", "#222222"],
  );
});

test("mergeSwatches returns an empty list for no usable input", () => {
  assert.deepEqual(mergeSwatches(undefined, [null, undefined]), []);
});
