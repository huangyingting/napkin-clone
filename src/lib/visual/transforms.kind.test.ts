import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_KINDS,
  safeParseVisual,
  validateVisual,
  type Visual,
} from "@/lib/visual/schema";
import { applyTheme, setVisualKind, setVisualStyle } from "./transforms";
import { sourceFor } from "./transforms.test-helpers";

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
  for (const to of [
    "flowchart",
    "mindmap",
    "concept",
    "venn",
    "orgchart",
  ] as const) {
    const next = setVisualKind(source, to);
    for (const node of next.nodes) {
      assert.equal(typeof node.x, "number");
      assert.equal(typeof node.y, "number");
      assert.ok(Number.isFinite(node.x as number));
      assert.ok(Number.isFinite(node.y as number));
    }
  }
});

test("setVisualKind keeps auto-layout Venn circles positioned", () => {
  const source: Visual = { ...sourceFor("flowchart"), autoLayout: true };
  const next = setVisualKind(source, "venn");
  for (const node of next.nodes) {
    assert.equal(typeof node.x, "number");
    assert.equal(typeof node.y, "number");
    assert.ok(Number.isFinite(node.x as number));
    assert.ok(Number.isFinite(node.y as number));
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
