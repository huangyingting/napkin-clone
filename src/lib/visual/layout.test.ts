import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundaryPoint,
  chartLayout,
  comparisonLayout,
  contentViewBox,
  cycleLayout,
  edgeSegments,
  funnelLayout,
  isPositionedKind,
  listLayout,
  matrixLayout,
  nodeBoxes,
  nodeCenter,
  nodeHalf,
  pyramidLayout,
  resizeNodeBox,
  timelineLayout,
} from "@/lib/visual/layout";
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
    edges: [{ id: "missing-endpoint", from: "a", to: "missing" }],
  });
  assert.equal(edgeSegments(visual).size, 0);
});

test("node geometry helpers use schema defaults when dimensions are absent", () => {
  const node = { id: "n", label: "Defaulted" };
  assert.deepEqual(nodeCenter(node), { x: 0, y: 0 });
  assert.deepEqual(nodeHalf(node), { hw: 75, hh: 28 });
});

test("contentViewBox expands only positioned visuals that overflow authored bounds", () => {
  const expanded = contentViewBox(
    makeVisual("flowchart", {
      nodes: [
        { id: "left", label: "Left", x: -20, y: 20, width: 100, height: 40 },
        {
          id: "bottom",
          label: "Bottom",
          x: 780,
          y: 510,
          width: 80,
          height: 60,
        },
      ],
    }),
  );
  assert.equal(expanded.x, -82);
  assert.equal(expanded.y, 0);
  assert.equal(expanded.width, 914);
  assert.equal(expanded.height, 552);

  assert.deepEqual(contentViewBox(makeVisual("chart")), {
    x: 0,
    y: 0,
    width: 760,
    height: 480,
  });
});

test("contentViewBox expands bottom overflow with padding", () => {
  const expanded = contentViewBox(
    makeVisual("flowchart", {
      nodes: [{ id: "bottom", label: "Bottom", x: 380, y: 510, height: 60 }],
    }),
  );
  assert.equal(expanded.y, 0);
  assert.equal(expanded.height, 552);
});

test("contentViewBox expands top overflow with padding", () => {
  const expanded = contentViewBox(
    makeVisual("mindmap", {
      nodes: [{ id: "top", label: "Top", x: 380, y: -20, height: 60 }],
    }),
  );
  assert.equal(expanded.y, -62);
  assert.equal(expanded.height, 542);
});

test("boundaryPoint handles coincident, horizontal, and vertical targets", () => {
  assert.deepEqual(boundaryPoint({ x: 10, y: 10 }, { x: 10, y: 10 }, 20, 15), {
    x: 10,
    y: 10,
  });
  assert.deepEqual(boundaryPoint({ x: 0, y: 50 }, { x: 100, y: 50 }, 25, 20), {
    x: 75,
    y: 50,
  });
  assert.deepEqual(boundaryPoint({ x: 40, y: 140 }, { x: 40, y: 40 }, 25, 20), {
    x: 40,
    y: 60,
  });
});

test("boundaryPoint chooses the nearer box edge for diagonal connectors", () => {
  assert.deepEqual(boundaryPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 25, 20), {
    x: 75,
    y: 37.5,
  });
});

test("isPositionedKind recognizes drag-positioned visual families", () => {
  assert.equal(isPositionedKind("flowchart"), true);
  assert.equal(isPositionedKind("orgchart"), true);
  assert.equal(isPositionedKind("chart"), false);
});

test("resizeNodeBox anchors the opposite corner and enforces minimum size", () => {
  const resized = resizeNodeBox({
    start: { x: 50, y: 50, width: 40, height: 20 },
    handle: "se",
    dx: -100,
    dy: -100,
    lockAspect: false,
    min: { w: 24, h: 16 },
    bounds: { width: 100, height: 100 },
  });
  assert.deepEqual(resized, { x: 42, y: 48, width: 24, height: 16 });
});

test("resizeNodeBox preserves aspect ratio and clamps to canvas bounds", () => {
  const resized = resizeNodeBox({
    start: { x: 80, y: 80, width: 40, height: 20 },
    handle: "nw",
    dx: -200,
    dy: -200,
    lockAspect: true,
    min: { w: 10, h: 10 },
    bounds: { width: 100, height: 100 },
  });
  assert.equal(resized.x, 50);
  assert.equal(resized.y, 65);
  assert.equal(resized.width, 100);
  assert.equal(resized.height, 50);
});

test("derived layout helpers compute stable geometry for every derived kind", () => {
  const visual = makeVisual("chart", {
    nodes: [
      { id: "a", label: "A", value: 10 },
      { id: "b", label: "B", value: 20 },
      { id: "c", label: "C", value: 5 },
    ],
  });

  assert.equal(chartLayout(visual).bars.length, 3);
  assert.equal(listLayout({ ...visual, type: "list" }).cards.length, 3);
  assert.equal(
    timelineLayout({ ...visual, type: "timeline" }).steps[1]?.above,
    false,
  );
  assert.equal(cycleLayout({ ...visual, type: "cycle" }).placements.length, 3);
  assert.equal(
    comparisonLayout({ ...visual, type: "comparison" }).columns.length,
    3,
  );
  assert.equal(funnelLayout({ ...visual, type: "funnel" }).bands.length, 3);
  assert.equal(pyramidLayout({ ...visual, type: "pyramid" }).bands.length, 3);
  assert.equal(matrixLayout({ ...visual, type: "matrix" }).quadrants.length, 4);
});

test("cycleLayout handles empty nodes with a stable fallback radius", () => {
  const layout = cycleLayout(makeVisual("cycle", { nodes: [] }));
  assert.equal(layout.placements.length, 0);
  assert.ok(layout.radius >= 40);
});

test("cycleLayout uses the minimum radius on a cramped canvas", () => {
  const layout = cycleLayout(
    makeVisual("cycle", {
      width: 120,
      height: 100,
      nodes: [
        { id: "a", label: "A", width: 150, height: 56 },
        { id: "b", label: "B", width: 150, height: 56 },
      ],
    }),
  );
  assert.equal(layout.radius, 40);
  assert.equal(layout.placements.length, 2);
});

test("cycleLayout places nodes around the computed radius", () => {
  const layout = cycleLayout(
    makeVisual("cycle", {
      width: 400,
      height: 300,
      nodes: [
        { id: "a", label: "A", width: 80, height: 40 },
        { id: "b", label: "B", width: 80, height: 40 },
      ],
    }),
  );

  assert.equal(layout.radius, 98);
  assert.equal(layout.placements[0].x, layout.cx);
  assert.equal(layout.placements[0].y, layout.cy - layout.radius);
  assert.equal(layout.placements[0].node.id, "a");
  assert.equal(layout.placements[0].index, 0);
  assert.equal(layout.placements[1].x, layout.cx);
  assert.equal(layout.placements[1].y, layout.cy + layout.radius);
  assert.equal(layout.placements[1].node.id, "b");
  assert.equal(layout.placements[1].index, 1);
});

test("nodeBoxes maps each visual kind to its interactive hit geometry", () => {
  for (const kind of [
    "flowchart",
    "chart",
    "timeline",
    "cycle",
    "comparison",
    "funnel",
    "pyramid",
    "matrix",
    "list",
  ] as const) {
    const boxes = nodeBoxes(
      makeVisual(kind, {
        nodes: [
          { id: "a", label: "A", x: 100, y: 100, width: 150, height: 56 },
          { id: "b", label: "B", x: 400, y: 100, width: 150, height: 56 },
        ],
      }),
    );
    assert.equal(boxes.size, 2, `${kind} should expose one hit box per node`);
    assert.ok(boxes.get("a")?.width, `${kind} hit box has width`);
  }
});
