import assert from "node:assert/strict";
import test from "node:test";

import {
  VISUAL_SCHEMA_VERSION,
  safeParseVisual,
  validateVisual,
  type Visual,
} from "@/lib/visual/schema";
import { validateEdge } from "@/lib/visual/schema-validation/edges";
import { parseEffects } from "@/lib/visual/schema-validation/effects";
import { parseVisualExportOptions } from "@/lib/visual/schema-validation/export-options";
import { validateNode } from "@/lib/visual/schema-validation/nodes";
import { normalizeStyle } from "@/lib/visual/schema-validation/style";

function baseVisual(nodes: Record<string, unknown>[]): Record<string, unknown> {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes,
    edges: [],
  };
}

test("validates a minimal visual without icons", () => {
  const visual = validateVisual(baseVisual([{ id: "a", label: "Alpha" }]));
  assert.equal(visual.type, "flowchart");
  assert.equal(visual.nodes.length, 1);
  assert.equal(visual.nodes[0].icon, undefined);
});

test("keeps a known icon name on a node", () => {
  const visual = validateVisual(
    baseVisual([{ id: "a", label: "Idea", icon: "Lightbulb" }]),
  );
  assert.equal(visual.nodes[0].icon, "Lightbulb");
});

test("drops an unknown icon name gracefully (no icon, not a failure)", () => {
  const visual = validateVisual(
    baseVisual([{ id: "a", label: "Idea", icon: "ThisIconDoesNotExist123" }]),
  );
  assert.equal(visual.nodes[0].icon, undefined);
});

test("ignores a non-string icon value without throwing", () => {
  const result = safeParseVisual(
    baseVisual([{ id: "a", label: "Idea", icon: 42 }]),
  );
  assert.equal(result.success, true);
  const data = (result as { success: true; data: Visual }).data;
  assert.equal(data.nodes[0].icon, undefined);
});

test("accepts a mix of nodes with and without icons", () => {
  const visual = validateVisual(
    baseVisual([
      { id: "a", label: "Alpha", icon: "Brain" },
      { id: "b", label: "Beta" },
    ]),
  );
  assert.equal(visual.nodes[0].icon, "Brain");
  assert.equal(visual.nodes[1].icon, undefined);
});

function visualWithEdge(
  edge: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...baseVisual([
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ]),
    edges: [edge],
  };
}

test("keeps a curved connector style", () => {
  const visual = validateVisual(
    visualWithEdge({ id: "e1", from: "a", to: "b", style: "curved" }),
  );
  assert.equal(visual.edges[0].style, "curved");
});

test("keeps a straight connector style", () => {
  const visual = validateVisual(
    visualWithEdge({ id: "e1", from: "a", to: "b", style: "straight" }),
  );
  assert.equal(visual.edges[0].style, "straight");
});

test("defaults to no connector style when omitted", () => {
  const visual = validateVisual(
    visualWithEdge({ id: "e1", from: "a", to: "b" }),
  );
  assert.equal(visual.edges[0].style, undefined);
});

test("drops an unknown connector style gracefully", () => {
  const result = safeParseVisual(
    visualWithEdge({ id: "e1", from: "a", to: "b", style: "zigzag" }),
  );
  assert.equal(result.success, true);
  const data = (result as { success: true; data: Visual }).data;
  assert.equal(data.edges[0].style, undefined);
});

test("ignores a non-string connector style without throwing", () => {
  const result = safeParseVisual(
    visualWithEdge({ id: "e1", from: "a", to: "b", style: 7 }),
  );
  assert.equal(result.success, true);
  const data = (result as { success: true; data: Visual }).data;
  assert.equal(data.edges[0].style, undefined);
});

test("node validation module keeps known icons and drops unknown icons", () => {
  assert.equal(
    validateNode({ id: "a", label: "Alpha", icon: "Lightbulb" }, 0).icon,
    "Lightbulb",
  );
  assert.equal(
    validateNode({ id: "b", label: "Beta", icon: "NoSuchIcon" }, 1).icon,
    undefined,
  );
});

test("edge validation module enforces node references and keeps style fields", () => {
  const edge = validateEdge(
    {
      id: "e1",
      from: "a",
      to: "b",
      style: "curved",
      arrowStyle: "open",
      lineStyle: "dashed",
    },
    0,
    new Set(["a", "b"]),
  );
  assert.equal(edge.style, "curved");
  assert.equal(edge.arrowStyle, "open");
  assert.equal(edge.lineStyle, "dashed");
  assert.throws(
    () =>
      validateEdge({ id: "e2", from: "a", to: "missing" }, 1, new Set(["a"])),
    /to must reference an existing node id/,
  );
});

test("style validation module merges defaults and rejects malformed style", () => {
  const style = normalizeStyle({ nodeFill: "#fff", fontSize: 18 });
  assert.equal(style.nodeFill, "#fff");
  assert.equal(style.fontSize, 18);
  assert.throws(() => normalizeStyle({ palette: [] }), /style.palette/);
});

test("effect validation module parses known effects and drops malformed entries", () => {
  const effects = parseEffects([
    { kind: "shadow", dx: 2, blur: 0, color: "black" },
    { kind: "sketch", frequency: 0.05, scale: 4 },
    { kind: "future-effect", value: true },
  ]);
  assert.equal(effects?.length, 2);
  assert.equal(effects?.[0].kind, "shadow");
  assert.equal(effects?.[1].kind, "sketch");
});

test("export option validation module keeps supported frame settings", () => {
  assert.deepEqual(
    parseVisualExportOptions({
      aspectRatio: "16:9",
      canvasStyle: "dot-grid",
    }),
    { aspectRatio: "16:9", canvasStyle: "dot-grid" },
  );
  assert.deepEqual(
    parseVisualExportOptions({ aspectRatio: "2:1", canvasStyle: "unknown" }),
    {},
  );
});
