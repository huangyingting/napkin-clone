/**
 * Unit tests for per-kind adapters (Epic #442, issue #445).
 *
 * Covers:
 *  - Adapter completeness (every VisualKind has an adapter)
 *  - Chart adapter: valid/invalid/migration
 *  - Flowchart adapter: dangling edges, migration
 *  - Venn adapter: node count, position, migration
 *  - Comparison adapter: column index validation
 *  - Matrix adapter: quadrant validation
 *  - Funnel adapter: value validation
 *  - Default adapter: passes any valid visual
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { VISUAL_KINDS, VISUAL_SCHEMA_VERSION } from "@/lib/visual/schema";
import type { Visual } from "@/lib/visual/schema";
import {
  assertAdapterCompleteness,
  getAdapter,
  migrateWithAdapter,
  validateWithAdapter,
} from "@/lib/visual/adapters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseVisual(
  type: Visual["type"],
  overrides: Partial<Visual> = {},
): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type,
    width: 600,
    height: 480,
    style: {
      palette: ["#6366f1"],
      background: "#ffffff",
      nodeFill: "#eef2ff",
      nodeStroke: "#4f46e5",
      nodeText: "#312e81",
      edgeColor: "#a5b4fc",
      fontFamily: "Inter",
      fontSize: 14,
      fontWeight: 500,
    },
    nodes: [],
    edges: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Exhaustiveness
// ---------------------------------------------------------------------------

test("every VisualKind has a registered adapter", () => {
  assert.doesNotThrow(() => assertAdapterCompleteness());
});

test("no adapter kind mismatch", () => {
  for (const kind of VISUAL_KINDS) {
    const adapter = getAdapter(kind);
    assert.equal(adapter.kind, kind, `Adapter kind mismatch for "${kind}"`);
  }
});

// ---------------------------------------------------------------------------
// Default adapter
// ---------------------------------------------------------------------------

test("default adapter passes any valid visual", () => {
  const visual = baseVisual("mindmap", {
    nodes: [{ id: "n1", label: "Root" }],
    edges: [],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("default adapter migrate is a no-op", () => {
  const visual = baseVisual("list", {
    nodes: [{ id: "n1", label: "Item" }],
  });
  const { migrated, changes } = migrateWithAdapter(visual);
  assert.equal(migrated, false);
  assert.equal(changes.length, 0);
});

// ---------------------------------------------------------------------------
// Chart adapter
// ---------------------------------------------------------------------------

test("chart adapter passes when all nodes have numeric values", () => {
  const visual = baseVisual("chart", {
    nodes: [
      { id: "n1", label: "A", value: 10 },
      { id: "n2", label: "B", value: 20 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("chart adapter fails when a node is missing value", () => {
  const visual = baseVisual("chart", {
    nodes: [
      { id: "n1", label: "A", value: 10 },
      { id: "n2", label: "B" },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]!.code, "chart.missing-value");
    assert.equal(result.errors[0]!.nodeId, "n2");
  }
});

test("chart adapter migration assigns value=0 to nodes missing value", () => {
  const visual = baseVisual("chart", {
    nodes: [
      { id: "n1", label: "A" },
      { id: "n2", label: "B", value: 5 },
    ],
  });
  const { migrated, visual: out, changes } = migrateWithAdapter(visual);
  assert.equal(migrated, true);
  assert.equal(changes.length, 1);
  assert.equal(out.nodes[0]!.value, 0);
  assert.equal(out.nodes[1]!.value, 5);
});

test("chart adapter editableNodeFields includes value", () => {
  const fields = getAdapter("chart").editableNodeFields();
  assert.ok((fields as string[]).includes("value"));
});

// ---------------------------------------------------------------------------
// Flowchart adapter
// ---------------------------------------------------------------------------

test("flowchart adapter passes when all edges reference existing nodes", () => {
  const visual = baseVisual("flowchart", {
    nodes: [
      { id: "n1", label: "Start", x: 100, y: 100 },
      { id: "n2", label: "End", x: 200, y: 200 },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2" }],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("flowchart adapter fails on dangling edge source", () => {
  const visual = baseVisual("flowchart", {
    nodes: [{ id: "n1", label: "Start", x: 100, y: 100 }],
    edges: [{ id: "e1", from: "missing", to: "n1" }],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]!.code, "flowchart.dangling-edge-from");
  }
});

test("flowchart adapter fails on dangling edge target", () => {
  const visual = baseVisual("flowchart", {
    nodes: [{ id: "n1", label: "Start", x: 100, y: 100 }],
    edges: [{ id: "e1", from: "n1", to: "missing" }],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]!.code, "flowchart.dangling-edge-to");
  }
});

test("flowchart adapter migration removes dangling edges", () => {
  const visual = baseVisual("flowchart", {
    nodes: [{ id: "n1", label: "Start", x: 100, y: 100 }],
    edges: [
      { id: "e1", from: "n1", to: "n1" },
      { id: "e2", from: "n1", to: "missing" },
    ],
  });
  const { migrated, visual: out, changes } = migrateWithAdapter(visual);
  assert.equal(migrated, true);
  assert.equal(out.edges.length, 1);
  assert.equal(out.edges[0]!.id, "e1");
  assert.equal(changes.length, 1);
});

test("flowchart adapter migration is a no-op for valid visuals", () => {
  const visual = baseVisual("flowchart", {
    nodes: [
      { id: "n1", label: "A", x: 100, y: 100 },
      { id: "n2", label: "B", x: 200, y: 200 },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2" }],
  });
  const { migrated } = migrateWithAdapter(visual);
  assert.equal(migrated, false);
});

// ---------------------------------------------------------------------------
// Venn adapter
// ---------------------------------------------------------------------------

test("venn adapter passes for 2-circle diagram with geometry", () => {
  const visual = baseVisual("venn", {
    nodes: [
      { id: "a", label: "Set A", x: 200, y: 240, width: 240, height: 240 },
      { id: "b", label: "Set B", x: 360, y: 240, width: 240, height: 240 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("venn adapter fails with only 1 node", () => {
  const visual = baseVisual("venn", {
    nodes: [
      { id: "a", label: "Set A", x: 200, y: 240, width: 240, height: 240 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]!.code, "venn.invalid-node-count");
  }
});

test("venn adapter fails with more than 3 nodes", () => {
  const nodes = Array.from({ length: 4 }, (_, i) => ({
    id: `n${i}`,
    label: `Set ${i}`,
    x: 100 + i * 100,
    y: 200,
    width: 200,
    height: 200,
  }));
  const visual = baseVisual("venn", { nodes });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.code === "venn.invalid-node-count"));
  }
});

test("venn adapter fails when nodes are missing position", () => {
  const visual = baseVisual("venn", {
    nodes: [
      { id: "a", label: "Set A", width: 240, height: 240 },
      { id: "b", label: "Set B", width: 240, height: 240 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.code === "venn.missing-position"));
  }
});

test("venn adapter migration assigns default positions when missing", () => {
  const visual = baseVisual("venn", {
    nodes: [
      { id: "a", label: "Set A" },
      { id: "b", label: "Set B" },
    ],
  });
  const { migrated, visual: out } = migrateWithAdapter(visual);
  assert.equal(migrated, true);
  for (const node of out.nodes) {
    assert.ok(typeof node.x === "number", `node ${node.id} missing x`);
    assert.ok(typeof node.y === "number", `node ${node.id} missing y`);
    assert.ok(typeof node.width === "number" && node.width > 0);
  }
});

// ---------------------------------------------------------------------------
// Comparison adapter
// ---------------------------------------------------------------------------

test("comparison adapter passes when all nodes have valid column index", () => {
  const visual = baseVisual("comparison", {
    nodes: [
      { id: "n1", label: "Col A", value: 0 },
      { id: "n2", label: "Col B", value: 1 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("comparison adapter fails when value is not a non-negative integer", () => {
  const visual = baseVisual("comparison", {
    nodes: [
      { id: "n1", label: "Col A", value: -1 },
      { id: "n2", label: "Col B", value: 1.5 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors.length, 2);
  }
});

test("comparison adapter migration assigns column 0 to invalid nodes", () => {
  const visual = baseVisual("comparison", {
    nodes: [
      { id: "n1", label: "Col A" },
      { id: "n2", label: "Item", value: 1 },
    ],
  });
  const { migrated, visual: out } = migrateWithAdapter(visual);
  assert.equal(migrated, true);
  assert.equal(out.nodes[0]!.value, 0);
  assert.equal(out.nodes[1]!.value, 1);
});

// ---------------------------------------------------------------------------
// Matrix adapter
// ---------------------------------------------------------------------------

test("matrix adapter passes when all nodes have valid quadrant (0-3)", () => {
  const visual = baseVisual("matrix", {
    nodes: [
      { id: "n1", label: "TL", value: 0 },
      { id: "n2", label: "TR", value: 1 },
      { id: "n3", label: "BL", value: 2 },
      { id: "n4", label: "BR", value: 3 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("matrix adapter fails on invalid quadrant", () => {
  const visual = baseVisual("matrix", {
    nodes: [{ id: "n1", label: "Bad", value: 5 }],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]!.code, "matrix.invalid-quadrant");
  }
});

// ---------------------------------------------------------------------------
// Funnel adapter
// ---------------------------------------------------------------------------

test("funnel adapter passes when all nodes have non-negative values", () => {
  const visual = baseVisual("funnel", {
    nodes: [
      { id: "n1", label: "Top", value: 100 },
      { id: "n2", label: "Mid", value: 60 },
      { id: "n3", label: "Bot", value: 20 },
    ],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, true);
});

test("funnel adapter fails when node has negative value", () => {
  const visual = baseVisual("funnel", {
    nodes: [{ id: "n1", label: "Bad", value: -5 }],
  });
  const result = validateWithAdapter(visual);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]!.code, "funnel.invalid-value");
  }
});

test("funnel adapter migration assigns decreasing default values", () => {
  const visual = baseVisual("funnel", {
    nodes: [
      { id: "n1", label: "Top" },
      { id: "n2", label: "Mid" },
      { id: "n3", label: "Bot" },
    ],
  });
  const { migrated, visual: out } = migrateWithAdapter(visual);
  assert.equal(migrated, true);
  // Values should be assigned (decreasing by default: 3, 2, 1 for 3 nodes)
  const values = out.nodes.map((n) => n.value as number);
  assert.ok(values.every((v) => typeof v === "number" && v > 0));
  assert.ok(values[0]! >= values[1]!, "First value should be >= second");
});

// ---------------------------------------------------------------------------
// Editable node fields
// ---------------------------------------------------------------------------

test("flowchart editableNodeFields includes shape", () => {
  const fields = getAdapter("flowchart").editableNodeFields();
  assert.ok((fields as string[]).includes("shape"));
});

test("venn editableNodeFields does not include shape", () => {
  const fields = getAdapter("venn").editableNodeFields();
  assert.equal((fields as string[]).includes("shape"), false);
});
