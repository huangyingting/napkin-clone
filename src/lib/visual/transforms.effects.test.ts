import assert from "node:assert/strict";
import { test } from "node:test";

import { VISUAL_KINDS, safeParseVisual } from "@/lib/visual/schema";
import {
  clearEffect,
  resetNodeExtStyle,
  setEffect,
  setNodeFontFamily,
} from "./transforms";
import { sourceFor } from "./transforms.test-helpers";

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
