import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_KINDS,
  safeParseVisual,
  validateVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { createBlankVisual, FIXTURES } from "@/lib/visual/fixtures";

import {
  applyTheme,
  clearNodeIcon,
  isThemeActive,
  resetNodeStyle,
  setNodeIcon,
  setNodeStyle,
  setVisualKind,
  setVisualStyle,
} from "./transforms";

/** A representative source visual per kind (richer fixtures, not blank seeds). */
function sourceFor(kind: VisualKind): Visual {
  return FIXTURES[kind];
}

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

test("setVisualKind yields schema-valid output for every kind pair", () => {
  for (const from of VISUAL_KINDS) {
    const source = sourceFor(from);
    for (const to of VISUAL_KINDS) {
      const next = setVisualKind(source, to);
      const validated = validateVisual(next);
      assert.equal(validated.type, to, `${from} -> ${to} type`);
      assert.equal(
        validated.nodes.length,
        source.nodes.length,
        `${from} -> ${to} node count preserved`,
      );
      // Every edge still references an existing node id.
      const ids = new Set(validated.nodes.map((node) => node.id));
      for (const edge of validated.edges) {
        assert.ok(ids.has(edge.from), `${from} -> ${to} edge.from valid`);
        assert.ok(ids.has(edge.to), `${from} -> ${to} edge.to valid`);
      }
    }
  }
});

test("setVisualKind preserves node labels and ids", () => {
  for (const from of VISUAL_KINDS) {
    const source = sourceFor(from);
    for (const to of VISUAL_KINDS) {
      const next = setVisualKind(source, to);
      assert.deepEqual(
        next.nodes.map((node) => node.id),
        source.nodes.map((node) => node.id),
        `${from} -> ${to} ids preserved`,
      );
      assert.deepEqual(
        next.nodes.map((node) => node.label),
        source.nodes.map((node) => node.label),
        `${from} -> ${to} labels preserved`,
      );
    }
  }
});

test("setVisualKind assigns finite positions for positioned kinds", () => {
  const source = sourceFor("list"); // list nodes have no x/y
  for (const to of ["flowchart", "mindmap", "concept"] as const) {
    const next = setVisualKind(source, to);
    for (const node of next.nodes) {
      assert.equal(typeof node.x, "number");
      assert.equal(typeof node.y, "number");
      assert.ok(Number.isFinite(node.x as number));
      assert.ok(Number.isFinite(node.y as number));
    }
  }
});

test("setVisualKind to the same kind returns an unchanged clone", () => {
  const source = sourceFor("timeline");
  const next = setVisualKind(source, "timeline");
  assert.notEqual(next, source);
  assert.deepEqual(next, source);
});

test("setVisualKind is immutable (input untouched)", () => {
  const source = sourceFor("flowchart");
  const before = JSON.stringify(source);
  setVisualKind(source, "funnel");
  assert.equal(JSON.stringify(source), before, "input must not be mutated");
});

test("transforms round-trip through safeParseVisual", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    const themed = applyTheme(source, "grape");
    const switched = setVisualKind(themed, "flowchart");
    const styled = setVisualStyle(switched, { fontSize: 18, fontWeight: 700 });
    const result = safeParseVisual(styled);
    assert.ok(result.success, `${kind} round-trip should parse`);
    if (result.success) {
      // Re-validation is idempotent: parsing the parsed output is stable.
      assert.deepEqual(safeParseVisual(result.data), result);
    }
  }
});

test("setVisualStyle merges a patch immutably", () => {
  const source = sourceFor("chart");
  const before = JSON.stringify(source);
  const next = setVisualStyle(source, { background: "#000000", fontSize: 20 });
  assert.equal(next.style.background, "#000000");
  assert.equal(next.style.fontSize, 20);
  assert.equal(next.style.nodeFill, source.style.nodeFill);
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setVisualStyle copies a patched palette (no aliasing)", () => {
  const source = sourceFor("chart");
  const palette = ["#111111", "#222222"];
  const next = setVisualStyle(source, { palette });
  palette.push("#333333");
  assert.deepEqual(next.style.palette, ["#111111", "#222222"]);
});

test("setNodeStyle / resetNodeStyle override and clear per-node colors", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const colored = setNodeStyle(source, id, "color", "#abcdef");
  assert.equal(colored.nodes[0].color, "#abcdef");
  assert.equal(source.nodes[0].color, undefined, "input untouched");

  const withAll = setNodeStyle(
    setNodeStyle(colored, id, "stroke", "#123456"),
    id,
    "textColor",
    "#654321",
  );
  const reset = resetNodeStyle(withAll, id);
  assert.equal(reset.nodes[0].color, undefined);
  assert.equal(reset.nodes[0].stroke, undefined);
  assert.equal(reset.nodes[0].textColor, undefined);
  assert.ok(safeParseVisual(reset).success);
});

test("setNodeIcon / clearNodeIcon set and remove a node icon", () => {
  const source = sourceFor("list");
  const id = source.nodes[0].id;
  const withIcon = setNodeIcon(source, id, "Rocket");
  assert.equal(withIcon.nodes[0].icon, "Rocket");
  const cleared = clearNodeIcon(withIcon, id);
  assert.equal(cleared.nodes[0].icon, undefined);
  // safeParseVisual drops unknown icons but keeps known ones.
  const parsed = safeParseVisual(withIcon);
  assert.ok(parsed.success);
  if (parsed.success) {
    assert.equal(parsed.data.nodes[0].icon, "Rocket");
  }
});
