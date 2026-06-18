import assert from "node:assert/strict";
import { test } from "node:test";

import { edgeSegments } from "@/components/visual/layout";
import {
  DEFAULT_STYLE,
  VISUAL_SCHEMA_VERSION,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

function makeVisual(kind: VisualKind, overrides: Partial<Visual> = {}): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: kind,
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "A", x: 100, y: 100, width: 150, height: 56 },
      { id: "b", label: "B", x: 400, y: 100, width: 150, height: 56 },
    ],
    edges: [{ id: "e1", from: "a", to: "b" }],
    style: { ...DEFAULT_STYLE },
    ...overrides,
  };
}

test("edgeSegments stops the connector at each node's boundary", () => {
  const segments = edgeSegments(makeVisual("flowchart"));
  const seg = segments.get("e1");
  assert.ok(seg, "edge e1 should have a segment");
  // Horizontal edge between two 150-wide nodes: boundaries at center ± half-width.
  assert.deepEqual(seg!.start, { x: 175, y: 100 });
  assert.deepEqual(seg!.end, { x: 325, y: 100 });
  assert.deepEqual(seg!.mid, { x: 250, y: 100 });
});

test("edgeSegments is empty for kinds that don't draw visual.edges", () => {
  assert.equal(edgeSegments(makeVisual("list")).size, 0);
  assert.equal(edgeSegments(makeVisual("chart")).size, 0);
});

test("edgeSegments skips edges whose endpoints are missing", () => {
  const visual = makeVisual("flowchart", {
    edges: [{ id: "ghost", from: "a", to: "missing" }],
  });
  assert.equal(edgeSegments(visual).size, 0);
});
