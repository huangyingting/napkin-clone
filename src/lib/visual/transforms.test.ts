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
import { VISUAL_DISPLAY_STYLES } from "@/lib/visual/display-styles";
import { createBlankVisual, FIXTURES } from "@/lib/visual/fixtures";

import {
  applyTheme,
  clearEffect,
  clearNodeIcon,
  isThemeActive,
  resetNodeStyle,
  resetNodeExtStyle,
  setEffect,
  setNodeIcon,
  setNodeStyle,
  setNodeFillStyle,
  setNodeBorderStyle,
  setNodeBorderWidth,
  setNodeTextAlign,
  setNodeFontFamily,
  setEdgeArrowStyle,
  setEdgeLineStyle,
  setEdgeLineWidth,
  setAllEdgesStyle,
  setVisualKind,
  setVisualStyle,
  applyDisplayStyle,
  isDisplayStyleActive,
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

// ── applyDisplayStyle / isDisplayStyleActive ──────────────────────────────────

test("applyDisplayStyle yields schema-valid visuals for every preset and kind", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    for (const preset of VISUAL_DISPLAY_STYLES) {
      const next = applyDisplayStyle(source, preset.id);
      const validated = validateVisual(next);
      assert.equal(
        validated.type,
        kind,
        `${kind} type preserved for ${preset.id}`,
      );
    }
  }
});

test("applyDisplayStyle preserves node ids and labels", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    for (const preset of VISUAL_DISPLAY_STYLES) {
      const next = applyDisplayStyle(source, preset.id);
      assert.deepEqual(
        next.nodes.map((n) => n.id),
        source.nodes.map((n) => n.id),
        `${kind}/${preset.id}: ids preserved`,
      );
      assert.deepEqual(
        next.nodes.map((n) => n.label),
        source.nodes.map((n) => n.label),
        `${kind}/${preset.id}: labels preserved`,
      );
    }
  }
});

test("applyDisplayStyle preserves node positions and values", () => {
  const source = sourceFor("flowchart");
  for (const preset of VISUAL_DISPLAY_STYLES) {
    const next = applyDisplayStyle(source, preset.id);
    for (let i = 0; i < source.nodes.length; i++) {
      assert.equal(
        next.nodes[i].x,
        source.nodes[i].x,
        `x preserved (${preset.id})`,
      );
      assert.equal(
        next.nodes[i].y,
        source.nodes[i].y,
        `y preserved (${preset.id})`,
      );
      assert.equal(
        next.nodes[i].value,
        source.nodes[i].value,
        `value preserved (${preset.id})`,
      );
    }
  }
});

test("applyDisplayStyle preserves edge topology (from/to/labels)", () => {
  const source = sourceFor("flowchart");
  for (const preset of VISUAL_DISPLAY_STYLES) {
    const next = applyDisplayStyle(source, preset.id);
    assert.equal(
      next.edges.length,
      source.edges.length,
      `edge count (${preset.id})`,
    );
    for (let i = 0; i < source.edges.length; i++) {
      assert.equal(
        next.edges[i].from,
        source.edges[i].from,
        `from (${preset.id})`,
      );
      assert.equal(next.edges[i].to, source.edges[i].to, `to (${preset.id})`);
      assert.equal(
        next.edges[i].label,
        source.edges[i].label,
        `edge label (${preset.id})`,
      );
    }
  }
});

test("applyDisplayStyle changes presentation fields (shapes, edge style, colors, fontWeight)", () => {
  const source = sourceFor("mindmap");
  for (const preset of VISUAL_DISPLAY_STYLES) {
    const next = applyDisplayStyle(source, preset.id);
    // Node shapes updated.
    for (const node of next.nodes) {
      assert.equal(node.shape, preset.nodeShape, `${preset.id} node shape`);
    }
    // Edge styles updated.
    for (const edge of next.edges) {
      assert.equal(edge.style, preset.edgeStyle, `${preset.id} edge style`);
    }
    // Colors updated.
    assert.equal(
      next.style.background,
      preset.colors.background,
      `${preset.id} background`,
    );
    assert.equal(
      next.style.nodeFill,
      preset.colors.nodeFill,
      `${preset.id} nodeFill`,
    );
    assert.equal(
      next.style.nodeText,
      preset.colors.nodeText,
      `${preset.id} nodeText`,
    );
    // Font weight updated.
    assert.equal(
      next.style.fontWeight,
      preset.fontWeight,
      `${preset.id} fontWeight`,
    );
  }
});

test("applyDisplayStyle preserves fontFamily and fontSize (typography untouched)", () => {
  const source = sourceFor("chart");
  const origFamily = source.style.fontFamily;
  const origSize = source.style.fontSize;
  for (const preset of VISUAL_DISPLAY_STYLES) {
    const next = applyDisplayStyle(source, preset.id);
    assert.equal(next.style.fontFamily, origFamily, `${preset.id} fontFamily`);
    assert.equal(next.style.fontSize, origSize, `${preset.id} fontSize`);
  }
});

test("applyDisplayStyle preserves per-node color overrides", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const withOverride = setNodeStyle(source, id, "color", "#ff0000");
  for (const preset of VISUAL_DISPLAY_STYLES) {
    const next = applyDisplayStyle(withOverride, preset.id);
    assert.equal(
      next.nodes[0].color,
      "#ff0000",
      `${preset.id}: per-node color override preserved`,
    );
  }
});

test("applyDisplayStyle is immutable (input untouched)", () => {
  const source = sourceFor("concept");
  const before = JSON.stringify(source);
  applyDisplayStyle(source, "bold");
  assert.equal(JSON.stringify(source), before, "input must not be mutated");
});

test("applyDisplayStyle with an unknown style id is a safe no-op clone", () => {
  const source = sourceFor("timeline");
  const next = applyDisplayStyle(source, "does-not-exist");
  assert.notEqual(next, source);
  assert.deepEqual(next, source);
  assert.ok(safeParseVisual(next).success);
});

test("isDisplayStyleActive reflects the applied display style", () => {
  const source = sourceFor("list");
  for (const preset of VISUAL_DISPLAY_STYLES) {
    const applied = applyDisplayStyle(source, preset.id);
    assert.equal(
      isDisplayStyleActive(applied, preset.id),
      true,
      `${preset.id} should be active after apply`,
    );
    // Other presets should not be active (unless two presets are identical — they're not by design).
    for (const other of VISUAL_DISPLAY_STYLES) {
      if (other.id !== preset.id) {
        assert.equal(
          isDisplayStyleActive(applied, other.id),
          false,
          `${other.id} should not be active when ${preset.id} is applied`,
        );
      }
    }
  }
});

test("isDisplayStyleActive returns false for unknown style id", () => {
  const source = sourceFor("funnel");
  assert.equal(isDisplayStyleActive(source, "does-not-exist"), false);
});

test("applyDisplayStyle round-trips through safeParseVisual", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    for (const preset of VISUAL_DISPLAY_STYLES) {
      const result = safeParseVisual(applyDisplayStyle(source, preset.id));
      assert.ok(result.success, `${kind}/${preset.id} round-trip`);
    }
  }
});

// ── New per-node extended style transforms ────────────────────────────────────

test("setNodeFillStyle sets fillStyle and is immutable", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const before = JSON.stringify(source);
  const next = setNodeFillStyle(source, id, "gradient");
  assert.equal(next.nodes[0].fillStyle, "gradient");
  assert.equal(source.nodes[0].fillStyle, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setNodeBorderStyle sets borderStyle and is immutable", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const before = JSON.stringify(source);
  const next = setNodeBorderStyle(source, id, "dashed");
  assert.equal(next.nodes[0].borderStyle, "dashed");
  assert.equal(source.nodes[0].borderStyle, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setNodeBorderWidth sets borderWidth and is immutable", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const before = JSON.stringify(source);
  const next = setNodeBorderWidth(source, id, 3);
  assert.equal(next.nodes[0].borderWidth, 3);
  assert.equal(source.nodes[0].borderWidth, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setNodeTextAlign sets textAlign and is immutable", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const before = JSON.stringify(source);
  const next = setNodeTextAlign(source, id, "left");
  assert.equal(next.nodes[0].textAlign, "left");
  assert.equal(source.nodes[0].textAlign, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("resetNodeExtStyle clears fillStyle, borderStyle, borderWidth, textAlign", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const styled = setNodeFillStyle(
    setNodeBorderStyle(
      setNodeBorderWidth(setNodeTextAlign(source, id, "right"), id, 4),
      id,
      "dotted",
    ),
    id,
    "gradient",
  );
  assert.equal(styled.nodes[0].fillStyle, "gradient");
  const reset = resetNodeExtStyle(styled, id);
  assert.equal(reset.nodes[0].fillStyle, undefined);
  assert.equal(reset.nodes[0].borderStyle, undefined);
  assert.equal(reset.nodes[0].borderWidth, undefined);
  assert.equal(reset.nodes[0].textAlign, undefined);
  assert.ok(safeParseVisual(reset).success);
});

test("resetNodeExtStyle leaves other nodes unchanged", () => {
  const source = sourceFor("flowchart");
  const id0 = source.nodes[0].id;
  const id1 = source.nodes[1].id;
  const styled = setNodeFillStyle(
    setNodeFillStyle(source, id0, "gradient"),
    id1,
    "gradient",
  );
  const reset = resetNodeExtStyle(styled, id0);
  assert.equal(reset.nodes[0].fillStyle, undefined);
  assert.equal(reset.nodes[1].fillStyle, "gradient");
});

// ── New per-edge transforms ───────────────────────────────────────────────────

test("setEdgeArrowStyle sets arrowStyle and is immutable", () => {
  const source = sourceFor("flowchart");
  if (source.edges.length === 0) return;
  const id = source.edges[0].id;
  const before = JSON.stringify(source);
  const next = setEdgeArrowStyle(source, id, "open");
  assert.equal(next.edges[0].arrowStyle, "open");
  assert.equal(source.edges[0].arrowStyle, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setEdgeLineStyle sets lineStyle and is immutable", () => {
  const source = sourceFor("flowchart");
  if (source.edges.length === 0) return;
  const id = source.edges[0].id;
  const before = JSON.stringify(source);
  const next = setEdgeLineStyle(source, id, "dashed");
  assert.equal(next.edges[0].lineStyle, "dashed");
  assert.equal(source.edges[0].lineStyle, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setEdgeLineWidth sets lineWidth and is immutable", () => {
  const source = sourceFor("flowchart");
  if (source.edges.length === 0) return;
  const id = source.edges[0].id;
  const before = JSON.stringify(source);
  const next = setEdgeLineWidth(source, id, 3);
  assert.equal(next.edges[0].lineWidth, 3);
  assert.equal(source.edges[0].lineWidth, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(safeParseVisual(next).success);
});

test("setAllEdgesStyle applies patch to all edges", () => {
  const source = sourceFor("flowchart");
  const before = JSON.stringify(source);
  const next = setAllEdgesStyle(source, {
    arrowStyle: "diamond",
    lineStyle: "dotted",
    lineWidth: 2,
  });
  for (const edge of next.edges) {
    assert.equal(edge.arrowStyle, "diamond");
    assert.equal(edge.lineStyle, "dotted");
    assert.equal(edge.lineWidth, 2);
  }
  assert.equal(JSON.stringify(source), before, "input untouched");
  assert.ok(safeParseVisual(next).success);
});

test("setAllEdgesStyle preserves edge content (from/to/label)", () => {
  const source = sourceFor("flowchart");
  const next = setAllEdgesStyle(source, { lineStyle: "dashed" });
  for (let i = 0; i < source.edges.length; i++) {
    assert.equal(next.edges[i].from, source.edges[i].from);
    assert.equal(next.edges[i].to, source.edges[i].to);
    assert.equal(next.edges[i].label, source.edges[i].label);
  }
});

// ── Optional current fields ───────────────────────────────────────────────────

test("validateVisual accepts visuals without optional node style fields", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    // Strip optional fields.
    const stripped = {
      ...source,
      nodes: source.nodes.map((n) => {
        const {
          fillStyle: _1,
          borderStyle: _2,
          borderWidth: _3,
          textAlign: _4,
          ...rest
        } = n;
        void _1;
        void _2;
        void _3;
        void _4;
        return rest;
      }),
      edges: source.edges.map((e) => {
        const { arrowStyle: _5, lineStyle: _6, lineWidth: _7, ...rest } = e;
        void _5;
        void _6;
        void _7;
        return rest;
      }),
    };
    const result = safeParseVisual(stripped);
    assert.ok(result.success, `${kind} old visual still validates`);
  }
});

test("validateVisual accepts all new field values", () => {
  const source = sourceFor("flowchart");
  const node = source.nodes[0];
  const edge = source.edges.length > 0 ? source.edges[0] : null;

  const withNewFields = {
    ...source,
    nodes: source.nodes.map((n) =>
      n.id === node.id
        ? {
            ...n,
            fillStyle: "gradient",
            borderStyle: "dashed",
            borderWidth: 2.5,
            textAlign: "right",
          }
        : n,
    ),
    edges:
      edge !== null
        ? source.edges.map((e) =>
            e.id === edge.id
              ? {
                  ...e,
                  arrowStyle: "circle",
                  lineStyle: "dotted",
                  lineWidth: 3,
                }
              : e,
          )
        : source.edges,
  };

  const result = safeParseVisual(withNewFields);
  assert.ok(result.success, "new fields validate");
  if (!result.success) return;

  const n = result.data.nodes.find((x) => x.id === node.id)!;
  assert.equal(n.fillStyle, "gradient");
  assert.equal(n.borderStyle, "dashed");
  assert.equal(n.borderWidth, 2.5);
  assert.equal(n.textAlign, "right");

  if (edge !== null) {
    const e = result.data.edges.find((x) => x.id === edge.id)!;
    assert.equal(e.arrowStyle, "circle");
    assert.equal(e.lineStyle, "dotted");
    assert.equal(e.lineWidth, 3);
  }
});

test("validateVisual silently drops unknown fillStyle values", () => {
  const source = sourceFor("flowchart");
  const withBad = {
    ...source,
    nodes: [
      { ...source.nodes[0], fillStyle: "radial" },
      ...source.nodes.slice(1),
    ],
  };
  const result = safeParseVisual(withBad);
  assert.ok(result.success, "unknown fillStyle accepted as no-op");
  if (result.success) {
    assert.equal(result.data.nodes[0].fillStyle, undefined);
  }
});

test("validateVisual silently drops unknown arrowStyle values", () => {
  const source = sourceFor("flowchart");
  if (source.edges.length === 0) return;
  const withBad = {
    ...source,
    edges: [
      { ...source.edges[0], arrowStyle: "zigzag" },
      ...source.edges.slice(1),
    ],
  };
  const result = safeParseVisual(withBad);
  assert.ok(result.success, "unknown arrowStyle accepted as no-op");
  if (result.success) {
    assert.equal(result.data.edges[0].arrowStyle, undefined);
  }
});

test("new node/edge style fields round-trip through safeParseVisual", () => {
  const source = sourceFor("flowchart");
  let v = source;
  const id0 = source.nodes[0].id;
  v = setNodeFillStyle(v, id0, "gradient");
  v = setNodeBorderStyle(v, id0, "dashed");
  v = setNodeBorderWidth(v, id0, 2);
  v = setNodeTextAlign(v, id0, "left");
  if (source.edges.length > 0) {
    const eid = source.edges[0].id;
    v = setEdgeArrowStyle(v, eid, "diamond");
    v = setEdgeLineStyle(v, eid, "dotted");
    v = setEdgeLineWidth(v, eid, 2.5);
  }
  const result = safeParseVisual(v);
  assert.ok(result.success, "round-trip succeeds");
  if (result.success) {
    assert.deepEqual(safeParseVisual(result.data), result);
  }
});

// ── Effect transforms (setEffect / clearEffect) ───────────────────────────────

test("setEffect appends a new effect and is immutable", () => {
  const source = sourceFor("flowchart");
  const before = JSON.stringify(source);
  const next = setEffect(source, { kind: "shadow" });
  assert.equal(source.effects, undefined, "input untouched");
  assert.equal(JSON.stringify(source), before);
  assert.ok(Array.isArray(next.effects));
  assert.equal(next.effects!.length, 1);
  assert.equal(next.effects![0].kind, "shadow");
  assert.ok(safeParseVisual(next).success);
});

test("setEffect with shadow params preserves custom dx/dy/blur/color", () => {
  const source = sourceFor("mindmap");
  const next = setEffect(source, {
    kind: "shadow",
    dx: 6,
    dy: 8,
    blur: 10,
    color: "rgba(0,0,0,0.5)",
  });
  assert.ok(next.effects && next.effects.length === 1);
  const effect = next.effects![0];
  assert.equal(effect.kind, "shadow");
  if (effect.kind === "shadow") {
    assert.equal(effect.dx, 6);
    assert.equal(effect.dy, 8);
    assert.equal(effect.blur, 10);
    assert.equal(effect.color, "rgba(0,0,0,0.5)");
  }
  assert.ok(safeParseVisual(next).success);
});

test("setEffect with sketch params preserves custom frequency/scale", () => {
  const source = sourceFor("concept");
  const next = setEffect(source, {
    kind: "sketch",
    frequency: 0.06,
    scale: 5,
  });
  assert.ok(next.effects && next.effects.length === 1);
  const effect = next.effects![0];
  assert.equal(effect.kind, "sketch");
  if (effect.kind === "sketch") {
    assert.equal(effect.frequency, 0.06);
    assert.equal(effect.scale, 5);
  }
  assert.ok(safeParseVisual(next).success);
});

test("setEffect replaces existing effect of the same kind", () => {
  const source = sourceFor("flowchart");
  const first = setEffect(source, { kind: "shadow", dx: 2, dy: 2, blur: 2 });
  const second = setEffect(first, { kind: "shadow", dx: 8, dy: 8, blur: 12 });
  assert.equal(second.effects!.length, 1, "no duplicate shadow effects");
  const effect = second.effects![0];
  if (effect.kind === "shadow") {
    assert.equal(effect.dx, 8);
    assert.equal(effect.blur, 12);
  }
  assert.ok(safeParseVisual(second).success);
});

test("setEffect allows multiple effects of different kinds", () => {
  const source = sourceFor("chart");
  const withShadow = setEffect(source, { kind: "shadow" });
  const withBoth = setEffect(withShadow, { kind: "sketch" });
  assert.equal(withBoth.effects!.length, 2);
  const kinds = withBoth.effects!.map((e) => e.kind);
  assert.ok(kinds.includes("shadow"));
  assert.ok(kinds.includes("sketch"));
  assert.ok(safeParseVisual(withBoth).success);
});

test("clearEffect removes a specific effect by kind", () => {
  const source = sourceFor("flowchart");
  const withShadow = setEffect(source, { kind: "shadow" });
  const cleared = clearEffect(withShadow, "shadow");
  assert.equal(cleared.effects, undefined, "effects field omitted when empty");
  assert.ok(safeParseVisual(cleared).success);
});

test("clearEffect only removes the matching kind, leaving others intact", () => {
  const source = sourceFor("mindmap");
  const withBoth = setEffect(setEffect(source, { kind: "shadow" }), {
    kind: "sketch",
  });
  const cleared = clearEffect(withBoth, "shadow");
  assert.ok(Array.isArray(cleared.effects));
  assert.equal(cleared.effects!.length, 1);
  assert.equal(cleared.effects![0].kind, "sketch");
  assert.ok(safeParseVisual(cleared).success);
});

test("clearEffect on a visual with no effects is a safe no-op clone", () => {
  const source = sourceFor("timeline");
  const before = JSON.stringify(source);
  const result = clearEffect(source, "shadow");
  assert.equal(JSON.stringify(source), before, "input untouched");
  assert.notEqual(result, source);
  assert.equal(result.effects, undefined);
  assert.ok(safeParseVisual(result).success);
});

test("clearEffect on a non-matching kind leaves effects unchanged", () => {
  const source = sourceFor("list");
  const withSketch = setEffect(source, { kind: "sketch" });
  const result = clearEffect(withSketch, "shadow");
  assert.equal(result.effects!.length, 1);
  assert.equal(result.effects![0].kind, "sketch");
});

test("effects round-trip through safeParseVisual for all kinds", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    const withShadow = setEffect(source, {
      kind: "shadow",
      dx: 4,
      dy: 4,
      blur: 6,
    });
    const withSketch = setEffect(source, {
      kind: "sketch",
      frequency: 0.04,
      scale: 3,
    });
    const withBoth = setEffect(withShadow, { kind: "sketch" });

    for (const [label, v] of [
      ["shadow", withShadow],
      ["sketch", withSketch],
      ["both", withBoth],
    ] as const) {
      const result = safeParseVisual(v);
      assert.ok(result.success, `${kind}/${label} round-trip`);
      if (result.success) {
        assert.deepEqual(safeParseVisual(result.data), result);
      }
    }
  }
});

test("existing visuals without effects field still parse successfully", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    assert.equal(source.effects, undefined, `${kind}: no effects by default`);
    const result = safeParseVisual(source);
    assert.ok(result.success, `${kind}: parses without effects`);
  }
});

test("validateVisual silently drops unknown effect kinds", () => {
  const source = sourceFor("flowchart");
  const withUnknown = {
    ...source,
    effects: [
      { kind: "unknown-future-effect", someParam: 42 },
      { kind: "shadow", dx: 2 },
    ],
  };
  const result = safeParseVisual(withUnknown);
  assert.ok(result.success);
  if (result.success) {
    assert.equal(result.data.effects!.length, 1, "only shadow survives");
    assert.equal(result.data.effects![0].kind, "shadow");
  }
});

test("setEffect / clearEffect immutability — input never mutated", () => {
  const source = sourceFor("cycle");
  const beforeSet = JSON.stringify(source);
  const withEffect = setEffect(source, { kind: "shadow" });
  assert.equal(
    JSON.stringify(source),
    beforeSet,
    "source untouched after setEffect",
  );

  const beforeClear = JSON.stringify(withEffect);
  clearEffect(withEffect, "shadow");
  assert.equal(
    JSON.stringify(withEffect),
    beforeClear,
    "input untouched after clearEffect",
  );
});

// ---------------------------------------------------------------------------
// setNodeFontFamily
// ---------------------------------------------------------------------------

test("setNodeFontFamily sets the fontFamily on the target node only", () => {
  const source = sourceFor("flowchart");
  const targetId = source.nodes[0].id;
  const family = "'Inter', sans-serif";
  const result = setNodeFontFamily(source, targetId, family);
  assert.equal(result.nodes[0].fontFamily, family);
  // Other nodes are unaffected
  for (const node of result.nodes.slice(1)) {
    assert.equal(node.fontFamily, undefined);
  }
});

test("setNodeFontFamily is immutable (input never mutated)", () => {
  const source = sourceFor("mindmap");
  const before = JSON.stringify(source);
  setNodeFontFamily(source, source.nodes[0].id, "'Roboto', sans-serif");
  assert.equal(JSON.stringify(source), before, "input must not be mutated");
});

test("setNodeFontFamily with empty string clears the override", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const withFamily = setNodeFontFamily(source, id, "'Inter', sans-serif");
  assert.equal(withFamily.nodes[0].fontFamily, "'Inter', sans-serif");
  const cleared = setNodeFontFamily(withFamily, id, "");
  assert.equal(cleared.nodes[0].fontFamily, undefined, "override cleared");
});

test("setNodeFontFamily on unknown id is a safe no-op clone", () => {
  const source = sourceFor("concept");
  const before = JSON.stringify(source);
  const result = setNodeFontFamily(
    source,
    "nonexistent-id",
    "'Inter', sans-serif",
  );
  assert.notEqual(result, source);
  // Nodes unchanged
  assert.equal(JSON.stringify(result.nodes), JSON.stringify(source.nodes));
  assert.equal(JSON.stringify(source), before, "input untouched");
});

test("setNodeFontFamily result round-trips through safeParseVisual", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    const id = source.nodes[0].id;
    const result = setNodeFontFamily(source, id, "'Inter', sans-serif");
    const parsed = safeParseVisual(result);
    assert.ok(parsed.success, `${kind}: round-trip`);
    if (parsed.success) {
      assert.equal(parsed.data.nodes[0].fontFamily, "'Inter', sans-serif");
    }
  }
});

test("resetNodeExtStyle also clears per-node fontFamily", () => {
  const source = sourceFor("flowchart");
  const id = source.nodes[0].id;
  const withFamily = setNodeFontFamily(source, id, "'Playfair Display', serif");
  assert.equal(withFamily.nodes[0].fontFamily, "'Playfair Display', serif");
  const reset = resetNodeExtStyle(withFamily, id);
  assert.equal(
    reset.nodes[0].fontFamily,
    undefined,
    "fontFamily cleared by reset",
  );
  assert.ok(safeParseVisual(reset).success);
});

test("existing visuals without per-node fontFamily still parse successfully", () => {
  for (const kind of VISUAL_KINDS) {
    const source = sourceFor(kind);
    for (const node of source.nodes) {
      assert.equal(
        node.fontFamily,
        undefined,
        `${kind}: no fontFamily by default`,
      );
    }
    const result = safeParseVisual(source);
    assert.ok(result.success, `${kind}: parses without fontFamily`);
  }
});
