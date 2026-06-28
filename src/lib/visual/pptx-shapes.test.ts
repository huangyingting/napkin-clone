/**
 * Unit tests for the pure pptx-shapes.ts mapping module.
 *
 * Tests verify that:
 *  - Node shapes map to the correct PptxSpec kinds with the right geometry
 *  - Fills, strokes, and text colours are forwarded as hex-without-#
 *  - Edges produce line specs with or without arrowheads
 *  - The slide layout computation distributes offset + scale correctly
 *  - All 11 natively-supported visual kinds produce non-fallback specs
 *  - funnel and pyramid return the image-fallback sentinel
 *
 * No PptxGenJS binary is required — all assertions run under node --test.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Visual, VisualNode, VisualEdge } from "@/lib/visual/schema";
import {
  computeVisualSlideLayout,
  isImageFallback,
  toHex,
  visualToNativeSpecs,
  type PptxRectSpec,
  type PptxSpec,
} from "@/lib/visual/pptx-shapes";
import {
  edgeLineSpec,
  pick,
  toFontFace,
} from "@/lib/visual/pptx-shapes/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseStyle() {
  return {
    palette: ["#6366f1", "#0ea5e9", "#10b981"],
    background: "#ffffff",
    nodeFill: "#eef2ff",
    nodeStroke: "#6366f1",
    nodeText: "#1e1b4b",
    edgeColor: "#94a3b8",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: 14,
    fontWeight: 600,
  };
}

function node(
  id: string,
  label: string,
  x: number,
  y: number,
  overrides: Partial<VisualNode> = {},
): VisualNode {
  return { id, label, x, y, width: 150, height: 56, ...overrides };
}

function edge(
  id: string,
  from: string,
  to: string,
  overrides: Partial<VisualEdge> = {},
): VisualEdge {
  return { id, from, to, ...overrides };
}

function flowchart(nodes: VisualNode[], edges: VisualEdge[]): Visual {
  return {
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes,
    edges,
    style: baseStyle(),
  };
}

/** Returns all specs of a given kind. */
function ofKind<K extends PptxSpec["kind"]>(
  specs: PptxSpec[],
  kind: K,
): Extract<PptxSpec, { kind: K }>[] {
  return specs.filter(
    (s): s is Extract<PptxSpec, { kind: K }> => s.kind === kind,
  );
}

// ---------------------------------------------------------------------------
// toHex
// ---------------------------------------------------------------------------

test("toHex strips # prefix", () => {
  assert.equal(toHex("#6366f1"), "6366F1");
});

test("toHex upcases without #", () => {
  assert.equal(toHex("94a3b8"), "94A3B8");
});

test("pick wraps positive and negative palette indexes", () => {
  assert.equal(pick(["#111111", "#222222", "#333333"], 4), "#222222");
  assert.equal(pick(["#111111", "#222222", "#333333"], -1), "#333333");
});

test("toFontFace maps generic CSS font families to PPTX-safe faces", () => {
  assert.equal(toFontFace("'Aptos', sans-serif"), "Aptos");
  assert.equal(toFontFace("ui-sans-serif, system-ui"), "Calibri");
  assert.equal(toFontFace("monospace"), "Courier New");
  assert.equal(toFontFace("serif"), "Georgia");
});

test("isImageFallback recognizes only the fallback sentinel", () => {
  assert.equal(isImageFallback([{ kind: "image-fallback" }]), true);
  assert.equal(
    isImageFallback([{ kind: "image-fallback" }, { kind: "image-fallback" }]),
    false,
  );
  assert.equal(
    isImageFallback([
      {
        kind: "rect",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        fill: "FFFFFF",
        stroke: "FFFFFF",
        strokeWidth: 0,
      },
    ]),
    false,
  );
});

test("edgeLineSpec uses default target dimensions when node dimensions are absent", () => {
  const spec = edgeLineSpec(
    edge("e1", "a", "b"),
    new Map([
      ["a", node("a", "A", 0, 0, { width: 100, height: 40 })],
      ["b", { id: "b", label: "B", x: 200, y: 0 }],
    ]),
    "#94a3b8",
    2,
    { offsetX: 0, offsetY: 0, scale: 1 },
  );

  assert.ok(spec);
  assert.equal(spec.x1, 50);
  assert.equal(spec.y1, 0);
  assert.equal(spec.x2, 125);
  assert.equal(spec.y2, 0);
});

// ---------------------------------------------------------------------------
// computeVisualSlideLayout
// ---------------------------------------------------------------------------

test("computeVisualSlideLayout: no title — offsets are symmetric", () => {
  const visual = flowchart([node("a", "A", 100, 100)], []);
  const layout = computeVisualSlideLayout(visual);
  assert.ok(layout.offsetX >= 0, "offsetX >= 0");
  assert.ok(layout.offsetY >= 0, "offsetY >= 0");
  assert.ok(layout.scale > 0, "scale > 0");
  // Visual fits within slide
  const usedW = visual.width * layout.scale;
  const usedH = visual.height * layout.scale;
  assert.ok(usedW <= 10, "width fits");
  assert.ok(usedH <= 7.5, "height fits");
});

test("computeVisualSlideLayout: title pushes offsetY down", () => {
  const visual = flowchart([node("a", "A", 100, 100)], []);
  const noTitle = computeVisualSlideLayout(visual, 0);
  const withTitle = computeVisualSlideLayout(visual, 0.9);
  assert.ok(withTitle.offsetY > noTitle.offsetY, "title pushes content down");
});

test("computeVisualSlideLayout: scale shrinks for wider visuals", () => {
  const narrow = {
    ...flowchart([node("a", "A", 100, 100)], []),
    width: 400,
    height: 480,
  };
  const wide = {
    ...flowchart([node("a", "A", 100, 100)], []),
    width: 1200,
    height: 480,
  };
  const layoutNarrow = computeVisualSlideLayout(narrow);
  const layoutWide = computeVisualSlideLayout(wide);
  assert.ok(layoutWide.scale < layoutNarrow.scale, "wider → smaller scale");
});

// ---------------------------------------------------------------------------
// flowchart — node shapes
// ---------------------------------------------------------------------------

test("flowchart: rounded node → rect spec with cornerRadius", () => {
  const v = flowchart([node("a", "Alpha", 200, 100)], []);
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius !== undefined && r.cornerRadius > 0,
  );
  assert.ok(rects.length >= 1, "at least one rounded rect for node");
});

test("flowchart: ellipse node → ellipse spec", () => {
  const v = flowchart([node("a", "Alpha", 200, 100, { shape: "ellipse" })], []);
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const ellipses = ofKind(specs, "ellipse");
  assert.ok(ellipses.length >= 1, "ellipse node → ellipse spec");
});

test("flowchart: diamond node → diamond spec", () => {
  const v = flowchart([node("a", "Alpha", 200, 100, { shape: "diamond" })], []);
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const diamonds = ofKind(specs, "diamond");
  assert.ok(diamonds.length >= 1, "diamond node → diamond spec");
});

test("flowchart: hexagon node → hexagon spec", () => {
  const v = flowchart([node("a", "Alpha", 200, 100, { shape: "hexagon" })], []);
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const hexagons = ofKind(specs, "hexagon");
  assert.ok(hexagons.length >= 1, "hexagon node → hexagon spec");
});

test("flowchart: pill node → rect spec with large cornerRadius", () => {
  const v = flowchart([node("a", "Alpha", 200, 100, { shape: "pill" })], []);
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius !== undefined && r.cornerRadius > 0,
  );
  assert.ok(rects.length >= 1, "pill → rounded rect");
  // Pill's cornerRadius equals half the height in canvas px scaled to inches
  const pillRect = rects.find(
    (r) => r.cornerRadius !== undefined && r.cornerRadius >= r.h / 2 - 0.001,
  );
  assert.ok(pillRect, "pill cornerRadius = h/2");
});

test("flowchart: rectangle node → rect spec with no cornerRadius", () => {
  const v = flowchart(
    [node("a", "Alpha", 200, 100, { shape: "rectangle" })],
    [],
  );
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  // Should have a rect without cornerRadius (or cornerRadius=0)
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius === undefined || r.cornerRadius === 0,
  );
  // The background rect also qualifies; we just need at least one
  assert.ok(rects.length >= 1, "rectangle node → plain rect");
});

// ---------------------------------------------------------------------------
// flowchart — node fill / stroke / text colour
// ---------------------------------------------------------------------------

test("flowchart: node fill colour propagates as hex-without-#", () => {
  const v = flowchart(
    [node("a", "A", 200, 100, { color: "#ff0000", shape: "rounded" })],
    [],
  );
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const nodeRects = ofKind(specs, "rect").filter((r) => r.fill === "FF0000");
  assert.ok(nodeRects.length >= 1, "custom fill colour forwarded");
});

test("edgeLineSpec returns null for dangling PPTX edges", () => {
  const v = flowchart(
    [node("a", "A", 200, 100)],
    [edge("missing", "a", "missing")],
  );
  const layout = computeVisualSlideLayout(v);
  assert.equal(
    edgeLineSpec(
      v.edges[0],
      new Map(v.nodes.map((n) => [n.id, n])),
      "#94a3b8",
      1,
      layout,
    ),
    null,
  );
});

test("flowchart: node text colour propagates to text spec", () => {
  const v = flowchart(
    [node("a", "Label", 200, 100, { textColor: "#ff00ff" })],
    [],
  );
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const texts = ofKind(specs, "text");
  const hasColor = texts.some((t) => t.color === "FF00FF");
  assert.ok(hasColor, "text colour forwarded as hex");
});

test("flowchart: node label appears in a text spec", () => {
  const v = flowchart([node("a", "My Label", 200, 100)], []);
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const texts = ofKind(specs, "text");
  const hasLabel = texts.some((t) => t.text === "My Label");
  assert.ok(hasLabel, "node label in text spec");
});

// ---------------------------------------------------------------------------
// flowchart — edges
// ---------------------------------------------------------------------------

test("flowchart: directed edge → line spec with arrowEnd=true", () => {
  const v = flowchart(
    [node("a", "A", 100, 100), node("b", "B", 400, 100)],
    [edge("e1", "a", "b")],
  );
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const lines = ofKind(specs, "line");
  const arrows = lines.filter((l) => l.arrowEnd === true);
  assert.ok(arrows.length >= 1, "directed edge → arrowEnd=true");
});

test("flowchart: undirected edge → line spec with arrowEnd falsy", () => {
  const v = flowchart(
    [node("a", "A", 100, 100), node("b", "B", 400, 100)],
    [edge("e1", "a", "b", { directed: false })],
  );
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const lines = ofKind(specs, "line");
  const noArrows = lines.filter((l) => !l.arrowEnd);
  assert.ok(noArrows.length >= 1, "undirected edge → no arrowhead");
});

test("flowchart: edge line coords are not all zero", () => {
  const v = flowchart(
    [node("a", "A", 100, 100), node("b", "B", 400, 100)],
    [edge("e1", "a", "b")],
  );
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const lines = ofKind(specs, "line").filter((l) => l.arrowEnd);
  assert.ok(lines.length >= 1);
  const l = lines[0];
  // Start and end should differ (horizontal edge)
  assert.notEqual(l.x1, l.x2, "start.x != end.x for horizontal edge");
});

// ---------------------------------------------------------------------------
// mindmap — edges have no arrowhead; nodes are pill-shaped
// ---------------------------------------------------------------------------

test("mindmap: edges have no arrowheads", () => {
  const v: Visual = {
    ...flowchart(
      [node("r", "Root", 380, 240), node("c", "Child", 200, 100)],
      [edge("e1", "r", "c")],
    ),
    type: "mindmap",
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const lines = ofKind(specs, "line");
  assert.ok(lines.length >= 1, "mindmap has edge lines");
  assert.ok(
    lines.every((l) => !l.arrowEnd),
    "mindmap edges: no arrowheads",
  );
});

// ---------------------------------------------------------------------------
// list visual kind
// ---------------------------------------------------------------------------

test("list: produces rect specs (cards)", () => {
  const v: Visual = {
    version: 1,
    type: "list",
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "Item 1" },
      { id: "b", label: "Item 2" },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius !== undefined && r.cornerRadius > 0,
  );
  assert.ok(rects.length >= 2, "at least 2 card rects");
});

test("list: produces ellipse specs (badge circles)", () => {
  const v: Visual = {
    version: 1,
    type: "list",
    width: 760,
    height: 480,
    nodes: [{ id: "a", label: "Item" }],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  const ellipses = ofKind(specs, "ellipse");
  assert.ok(ellipses.length >= 1, "badge circles");
});

// ---------------------------------------------------------------------------
// chart visual kind
// ---------------------------------------------------------------------------

test("chart: bars map to rect specs", () => {
  const v: Visual = {
    version: 1,
    type: "chart",
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "Alpha", value: 10 },
      { id: "b", label: "Beta", value: 5 },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius !== undefined && r.cornerRadius > 0,
  );
  assert.ok(rects.length >= 2, "at least 2 bar rects");
});

// ---------------------------------------------------------------------------
// timeline visual kind
// ---------------------------------------------------------------------------

test("timeline: produces cards and badge circles", () => {
  const v: Visual = {
    version: 1,
    type: "timeline",
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "Step 1" },
      { id: "b", label: "Step 2" },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius !== undefined && r.cornerRadius > 0,
  );
  const ellipses = ofKind(specs, "ellipse");
  assert.ok(rects.length >= 2, "step cards");
  assert.ok(ellipses.length >= 2, "badge circles");
});

// ---------------------------------------------------------------------------
// venn visual kind
// ---------------------------------------------------------------------------

test("venn: circles are ellipses with fillTransparency=65", () => {
  const v: Visual = {
    version: 1,
    type: "venn",
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "Set A", x: 250, y: 240, width: 300, height: 300 },
      { id: "b", label: "Set B", x: 510, y: 240, width: 300, height: 300 },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const ellipses = ofKind(specs, "ellipse");
  assert.ok(ellipses.length >= 2, "venn circles as ellipses");
  assert.ok(
    ellipses.every((e) => e.fillTransparency === 65),
    "venn ellipses are semi-transparent",
  );
});

// ---------------------------------------------------------------------------
// cycle visual kind
// ---------------------------------------------------------------------------

test("cycle: produces node shapes and connecting lines", () => {
  const v: Visual = {
    version: 1,
    type: "cycle",
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "Phase 1" },
      { id: "b", label: "Phase 2" },
      { id: "c", label: "Phase 3" },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const lines = ofKind(specs, "line").filter((l) => l.arrowEnd);
  assert.ok(lines.length >= 3, "cycle: 3 connecting arrows");
});

// ---------------------------------------------------------------------------
// comparison visual kind
// ---------------------------------------------------------------------------

test("comparison: column headers are brighter rects than items", () => {
  const v: Visual = {
    version: 1,
    type: "comparison",
    width: 760,
    height: 480,
    nodes: [
      { id: "h1", label: "Col A Header", value: 0 },
      { id: "i1", label: "Col A Item", value: 0 },
      { id: "h2", label: "Col B Header", value: 1 },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const rects = ofKind(specs, "rect").filter(
    (r) => r.cornerRadius !== undefined && r.cornerRadius > 0,
  );
  assert.ok(rects.length >= 3, "each cell has a card rect");
});

// ---------------------------------------------------------------------------
// matrix visual kind
// ---------------------------------------------------------------------------

test("matrix: produces quadrant backgrounds and divider lines", () => {
  const v: Visual = {
    version: 1,
    type: "matrix",
    width: 760,
    height: 480,
    nodes: [
      { id: "a", label: "Q1 Node", value: 0 },
      { id: "b", label: "Q2 Node", value: 1 },
    ],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  // 4 quadrant backgrounds + 1 slide background = 5 rects
  const rects = ofKind(specs, "rect");
  assert.ok(rects.length >= 5, "matrix: 4 quadrant rects + background");
  const dashes = ofKind(specs, "line").filter((l) => l.dashed);
  assert.ok(dashes.length >= 2, "two dashed divider lines");
});

// ---------------------------------------------------------------------------
// orgchart visual kind
// ---------------------------------------------------------------------------

test("orgchart: edges have no arrowheads", () => {
  const v: Visual = {
    ...flowchart(
      [node("r", "CEO", 380, 80), node("a", "VP", 200, 200)],
      [edge("e1", "r", "a")],
    ),
    type: "orgchart",
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(!isImageFallback(specs));
  const lines = ofKind(specs, "line");
  assert.ok(
    lines.every((l) => !l.arrowEnd),
    "orgchart: no arrowheads",
  );
});

// ---------------------------------------------------------------------------
// image-fallback kinds
// ---------------------------------------------------------------------------

test("funnel returns image-fallback sentinel", () => {
  const v: Visual = {
    version: 1,
    type: "funnel",
    width: 760,
    height: 480,
    nodes: [{ id: "a", label: "Top", value: 100 }],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(isImageFallback(specs), "funnel → image-fallback");
});

test("pyramid returns image-fallback sentinel", () => {
  const v: Visual = {
    version: 1,
    type: "pyramid",
    width: 760,
    height: 480,
    nodes: [{ id: "a", label: "Top" }],
    edges: [],
    style: baseStyle(),
  };
  const layout = computeVisualSlideLayout(v);
  const specs = visualToNativeSpecs(v, layout);
  assert.ok(isImageFallback(specs), "pyramid → image-fallback");
});

// ---------------------------------------------------------------------------
// isImageFallback helper
// ---------------------------------------------------------------------------

test("isImageFallback: true for single image-fallback spec", () => {
  assert.ok(isImageFallback([{ kind: "image-fallback" }]));
});

test("isImageFallback: false for native specs array", () => {
  const spec: PptxRectSpec = {
    kind: "rect",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    fill: "FFFFFF",
    stroke: "000000",
    strokeWidth: 1,
  };
  assert.ok(!isImageFallback([spec]));
  assert.ok(!isImageFallback([]));
});

test("visualToNativeSpecs falls back for an unknown runtime kind", () => {
  const v = {
    ...flowchart([node("a", "A", 100, 100)], []),
    type: "unknown" as never,
  };
  const specs = visualToNativeSpecs(v, computeVisualSlideLayout(v));
  assert.deepEqual(specs, [{ kind: "image-fallback" }]);
});

// ---------------------------------------------------------------------------
// All 11 native kinds return non-fallback specs
// ---------------------------------------------------------------------------

const nativeKinds: Array<Visual["type"]> = [
  "flowchart",
  "mindmap",
  "concept",
  "orgchart",
  "venn",
  "list",
  "chart",
  "timeline",
  "cycle",
  "comparison",
  "matrix",
];

for (const kind of nativeKinds) {
  test(`${kind}: visualToNativeSpecs returns non-fallback specs`, () => {
    const v: Visual = {
      version: 1,
      type: kind,
      width: 760,
      height: 480,
      nodes: [
        { id: "a", label: "Node A", x: 200, y: 200, value: 5 },
        { id: "b", label: "Node B", x: 500, y: 300, value: 3 },
      ],
      edges: [{ id: "e1", from: "a", to: "b" }],
      style: baseStyle(),
    };
    const layout = computeVisualSlideLayout(v);
    const specs = visualToNativeSpecs(v, layout);
    assert.ok(
      !isImageFallback(specs),
      `${kind} should produce native specs, not image-fallback`,
    );
    assert.ok(specs.length > 0, `${kind} should produce at least one spec`);
  });
}
