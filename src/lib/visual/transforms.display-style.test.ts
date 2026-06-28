import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_KINDS,
  safeParseVisual,
  validateVisual,
} from "@/lib/visual/schema";
import { VISUAL_DISPLAY_STYLES } from "@/lib/visual/display-styles";
import {
  applyDisplayStyle,
  isDisplayStyleActive,
  setNodeStyle,
} from "./transforms";
import { sourceFor } from "./transforms.test-helpers";

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

test("isDisplayStyleActive detects palette, node shape, and edge style drift", () => {
  const source = sourceFor("flowchart");
  const preset = VISUAL_DISPLAY_STYLES[0];
  const applied = applyDisplayStyle(source, preset.id);
  const alternateShape =
    preset.nodeShape === "diamond" ? "rectangle" : "diamond";
  const alternateEdge = preset.edgeStyle === "curved" ? "straight" : "curved";

  assert.equal(
    isDisplayStyleActive(
      {
        ...applied,
        style: { ...applied.style, palette: ["#000000"] },
      },
      preset.id,
    ),
    false,
  );
  assert.equal(
    isDisplayStyleActive(
      {
        ...applied,
        nodes: [
          { ...applied.nodes[0], shape: alternateShape },
          ...applied.nodes.slice(1),
        ],
      },
      preset.id,
    ),
    false,
  );
  assert.equal(
    isDisplayStyleActive(
      {
        ...applied,
        edges: [
          { ...applied.edges[0], style: alternateEdge },
          ...applied.edges.slice(1),
        ],
      },
      preset.id,
    ),
    false,
  );
});

test("isDisplayStyleActive detects same-length palette value drift", () => {
  const source = sourceFor("list");
  const preset = VISUAL_DISPLAY_STYLES[0];
  const applied = applyDisplayStyle(source, preset.id);
  const palette = [...applied.style.palette];
  palette[0] = palette[0] === "#000000" ? "#ffffff" : "#000000";

  assert.equal(
    isDisplayStyleActive(
      {
        ...applied,
        style: { ...applied.style, palette },
      },
      preset.id,
    ),
    false,
  );
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
