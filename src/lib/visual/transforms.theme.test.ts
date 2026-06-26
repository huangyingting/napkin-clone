import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_KINDS,
  safeParseVisual,
  validateVisual,
} from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { createBlankVisual } from "@/lib/visual/blank";
import { applyTheme, isThemeActive } from "./transforms";
import { sourceFor } from "./transforms.test-helpers";

test("applyTheme yields schema-valid visuals for every theme and kind", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    for (const theme of STYLE_THEMES) {
      const next = applyTheme(source, theme.id);
      // validateVisual throws on any structural problem.
      const validated = validateVisual(next);
      assert.equal(validated.type, kind);
      assert.deepEqual(validated.style.palette, theme.colors.palette);
      assert.equal(validated.style.background, theme.colors.background);
      assert.equal(validated.style.nodeFill, theme.colors.nodeFill);
      assert.equal(validated.style.nodeStroke, theme.colors.nodeStroke);
      assert.equal(validated.style.nodeText, theme.colors.nodeText);
      assert.equal(validated.style.edgeColor, theme.colors.edgeColor);
    }
  }
});

test("applyTheme preserves typography (font family/size/weight)", () => {
  const source = sourceFor("flowchart");
  for (const theme of STYLE_THEMES) {
    const next = applyTheme(source, theme.id);
    assert.equal(next.style.fontFamily, source.style.fontFamily);
    assert.equal(next.style.fontSize, source.style.fontSize);
    assert.equal(next.style.fontWeight, source.style.fontWeight);
  }
});

test("applyTheme is immutable (input untouched, fresh output)", () => {
  const source = createBlankVisual("flowchart");
  const before = JSON.stringify(source);
  const next = applyTheme(source, "ocean");
  assert.notEqual(next, source);
  assert.notEqual(next.style, source.style);
  assert.equal(JSON.stringify(source), before, "input must not be mutated");
});

test("applyTheme with an unknown theme id is a safe no-op clone", () => {
  const source = sourceFor("chart");
  const next = applyTheme(source, "does-not-exist");
  assert.notEqual(next, source);
  assert.deepEqual(next.style, source.style);
  assert.ok(safeParseVisual(next).success);
});

test("isThemeActive reflects the applied theme", () => {
  const source = sourceFor("mindmap");
  const applied = applyTheme(source, "forest");
  assert.equal(isThemeActive(applied, "forest"), true);
  assert.equal(isThemeActive(applied, "sunset"), false);
  assert.equal(isThemeActive(applied, "unknown"), false);
});
