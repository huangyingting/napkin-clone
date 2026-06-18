import assert from "node:assert/strict";
import test from "node:test";

import {
  VISUAL_SCHEMA_VERSION,
  safeParseVisual,
  validateVisual,
  type Visual,
} from "@/lib/visual/schema";

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

test("defaults to no style when omitted (backward compatible)", () => {
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
