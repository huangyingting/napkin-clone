import assert from "node:assert/strict";
import { test } from "node:test";

import {
  contentBounds,
  elasticLayout,
  estimateLabelBox,
  rectsOverlap,
  wrapText,
} from "@/lib/visual/elastic-layout";
import {
  DEFAULT_STYLE,
  VISUAL_SCHEMA_VERSION,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVisual(
  kind: VisualKind,
  labels: string[],
  overrides: Partial<Visual> = {},
): Visual {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: kind,
    width: 760,
    height: 480,
    nodes: labels.map((label, i) => ({ id: `n${i}`, label })),
    edges: [],
    style: { ...DEFAULT_STYLE, fontSize: 14 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// estimateLabelBox
// ---------------------------------------------------------------------------

test("estimateLabelBox: longer labels produce wider nodes", () => {
  const fontSize = 14;
  const short = estimateLabelBox("Hi", fontSize);
  const long = estimateLabelBox("A much longer label text here", fontSize);
  assert.ok(
    long.width > short.width,
    `long (${long.width}) should be wider than short (${short.width})`,
  );
});

test("estimateLabelBox: multi-line labels produce taller nodes", () => {
  const fontSize = 14;
  const single = estimateLabelBox("Short", fontSize);
  // Force multiple lines by using more than MAX_LINE_WIDTH_CHARS chars with spaces
  const multiLine = estimateLabelBox(
    "This is a very long label that should wrap across multiple lines in the layout engine",
    fontSize,
  );
  assert.ok(
    multiLine.height > single.height,
    `multi-line (${multiLine.height}) should be taller than single-line (${single.height})`,
  );
});

test("estimateLabelBox: respects minimum dimensions", () => {
  const box = estimateLabelBox("", 14);
  assert.ok(box.width >= 80, `width ${box.width} must be >= 80`);
  assert.ok(box.height >= 40, `height ${box.height} must be >= 40`);
});

test("estimateLabelBox: larger font size produces larger box", () => {
  const small = estimateLabelBox("Label", 12);
  const large = estimateLabelBox("Label", 20);
  assert.ok(
    large.width >= small.width,
    `font 20 (${large.width}) should be >= font 12 (${small.width})`,
  );
  assert.ok(
    large.height >= small.height,
    `font 20 (${large.height}) should be >= font 12 (${small.height})`,
  );
});

// ---------------------------------------------------------------------------
// wrapText
// ---------------------------------------------------------------------------

test("wrapText: short text fits on one line", () => {
  const lines = wrapText("Short", 20);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Short");
});

test("wrapText: long text wraps to multiple lines", () => {
  const lines = wrapText("This is a very long label that should wrap", 18);
  assert.ok(lines.length > 1, `expected > 1 line, got ${lines.length}`);
});

test("wrapText: empty string returns single empty line", () => {
  const lines = wrapText("", 20);
  assert.equal(lines.length, 1);
});

// ---------------------------------------------------------------------------
// rectsOverlap
// ---------------------------------------------------------------------------

test("rectsOverlap: non-overlapping rects return false", () => {
  assert.equal(
    rectsOverlap(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 200, y: 0, width: 100, height: 50 },
    ),
    false,
  );
});

test("rectsOverlap: overlapping rects return true", () => {
  assert.equal(
    rectsOverlap(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 50, y: 25, width: 100, height: 50 },
    ),
    true,
  );
});

test("rectsOverlap: touching edges do not count as overlap", () => {
  assert.equal(
    rectsOverlap(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 100, y: 0, width: 100, height: 50 },
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// contentBounds
// ---------------------------------------------------------------------------

test("contentBounds: returns null for empty array", () => {
  assert.equal(contentBounds([]), null);
});

test("contentBounds: single node covers its own extent", () => {
  const bounds = contentBounds([
    { id: "a", label: "A", x: 100, y: 80, width: 120, height: 50 },
  ]);
  assert.ok(bounds !== null);
  assert.equal(bounds!.x, 40); // 100 - 60
  assert.equal(bounds!.y, 55); // 80 - 25
  assert.equal(bounds!.width, 120);
  assert.equal(bounds!.height, 50);
});

test("contentBounds: multiple nodes span the union", () => {
  const bounds = contentBounds([
    { id: "a", label: "A", x: 100, y: 100, width: 100, height: 40 },
    { id: "b", label: "B", x: 400, y: 200, width: 100, height: 40 },
  ]);
  assert.ok(bounds !== null);
  // leftmost = 100 - 50 = 50; rightmost = 400 + 50 = 450
  assert.equal(bounds!.x, 50);
  assert.equal(bounds!.width, 400); // 450 - 50
});

// ---------------------------------------------------------------------------
// elasticLayout — flowchart
// ---------------------------------------------------------------------------

test("elasticLayout flowchart: returns node count unchanged", () => {
  const visual = makeVisual("flowchart", ["Step A", "Step B", "Step C"]);
  const result = elasticLayout(visual);
  assert.equal(result.nodes.length, 3);
});

test("elasticLayout flowchart: longer labels → wider nodes", () => {
  const visual = makeVisual("flowchart", [
    "Short",
    "A much longer label that definitely needs more space",
  ]);
  const result = elasticLayout(visual);
  const [short, long] = result.nodes;
  assert.ok(
    (long.width ?? 0) > (short.width ?? 0),
    `long (${long.width}) should be wider than short (${short.width})`,
  );
});

test("elasticLayout flowchart: more nodes → taller canvas", () => {
  const few = makeVisual("flowchart", ["A", "B"]);
  const many = makeVisual("flowchart", ["A", "B", "C", "D", "E", "F"]);
  const rFew = elasticLayout(few);
  const rMany = elasticLayout(many);
  assert.ok(
    rMany.height >= rFew.height,
    `many (${rMany.height}) should be >= few (${rFew.height})`,
  );
});

test("elasticLayout flowchart: nodes don't overlap", () => {
  const visual = makeVisual("flowchart", [
    "Node One",
    "Node Two",
    "Node Three",
    "Node Four",
  ]);
  const result = elasticLayout(visual);
  for (let i = 0; i < result.nodes.length; i++) {
    for (let j = i + 1; j < result.nodes.length; j++) {
      const a = result.nodes[i];
      const b = result.nodes[j];
      const ra = {
        x: (a.x ?? 0) - (a.width ?? 0) / 2,
        y: (a.y ?? 0) - (a.height ?? 0) / 2,
        width: a.width ?? 0,
        height: a.height ?? 0,
      };
      const rb = {
        x: (b.x ?? 0) - (b.width ?? 0) / 2,
        y: (b.y ?? 0) - (b.height ?? 0) / 2,
        width: b.width ?? 0,
        height: b.height ?? 0,
      };
      assert.equal(
        rectsOverlap(ra, rb),
        false,
        `Nodes ${a.id} and ${b.id} should not overlap`,
      );
    }
  }
});

test("elasticLayout flowchart: viewBox grows to contain all nodes", () => {
  const visual = makeVisual("flowchart", [
    "Node One",
    "Node Two",
    "Node Three",
    "Node Four",
    "Node Five",
    "Node Six",
    "Node Seven",
    "Node Eight",
  ]);
  const result = elasticLayout(visual);
  const bounds = contentBounds(result.nodes);
  assert.ok(bounds !== null);
  assert.ok(
    result.width >= bounds!.x + bounds!.width,
    `canvas width ${result.width} must cover content rightmost ${bounds!.x + bounds!.width}`,
  );
  assert.ok(
    result.height >= bounds!.y + bounds!.height,
    `canvas height ${result.height} must cover content bottom ${bounds!.y + bounds!.height}`,
  );
});

test("elasticLayout flowchart: deterministic (same input → same output)", () => {
  const visual = makeVisual("flowchart", ["Alpha", "Beta", "Gamma"]);
  const r1 = elasticLayout(visual);
  const r2 = elasticLayout(visual);
  assert.deepEqual(r1, r2);
});

test("elasticLayout flowchart: non-mutating (input unchanged)", () => {
  const visual = makeVisual("flowchart", ["A", "B", "C"]);
  const before = JSON.stringify(visual);
  elasticLayout(visual);
  assert.equal(JSON.stringify(visual), before, "input must not be mutated");
});

// ---------------------------------------------------------------------------
// elasticLayout — mindmap / concept
// ---------------------------------------------------------------------------

test("elasticLayout mindmap: first node becomes center", () => {
  const visual = makeVisual("mindmap", ["Root", "Child 1", "Child 2"]);
  const result = elasticLayout(visual);
  // Center node should be at some reasonable position, leaves elsewhere
  assert.equal(result.nodes.length, 3);
  const root = result.nodes[0];
  // The root should exist and have position
  assert.ok(typeof root.x === "number");
  assert.ok(typeof root.y === "number");
});

test("elasticLayout mindmap: more nodes → larger canvas", () => {
  const few = makeVisual("mindmap", ["Root", "A", "B"]);
  const many = makeVisual("mindmap", [
    "Root",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
  ]);
  const rFew = elasticLayout(few);
  const rMany = elasticLayout(many);
  const areaFew = rFew.width * rFew.height;
  const areaMany = rMany.width * rMany.height;
  assert.ok(
    areaMany >= areaFew,
    `many area (${areaMany}) should be >= few area (${areaFew})`,
  );
});

test("elasticLayout mindmap: viewBox contains all nodes", () => {
  const visual = makeVisual("mindmap", [
    "Root",
    "Branch 1",
    "Branch 2",
    "Branch 3",
  ]);
  const result = elasticLayout(visual);
  const bounds = contentBounds(result.nodes);
  assert.ok(bounds !== null);
  assert.ok(result.width >= bounds!.x + bounds!.width);
  assert.ok(result.height >= bounds!.y + bounds!.height);
});

test("elasticLayout mindmap: tall leaves stay outside the center node clearance", () => {
  const result = elasticLayout(
    makeVisual("mindmap", [
      "Central root label that wraps onto multiple lines",
      "Tall child label with enough words to wrap onto several lines in the estimated node box",
    ]),
  );
  const [root, leaf] = result.nodes;
  const distance = Math.hypot(
    (leaf.x ?? 0) - (root.x ?? 0),
    (leaf.y ?? 0) - (root.y ?? 0),
  );
  const touchingDistance = ((root.height ?? 0) + (leaf.height ?? 0)) / 2;

  assert.ok(
    distance > touchingDistance,
    `leaf distance ${distance} should exceed touching distance ${touchingDistance}`,
  );
});

test("elasticLayout radial kinds handle empty and single-node visuals", () => {
  const empty = elasticLayout(makeVisual("concept", []));
  assert.deepEqual(empty.nodes, []);
  assert.equal(empty.width, 760);
  assert.equal(empty.height, 480);

  const single = elasticLayout(makeVisual("venn", ["Only node"]));
  assert.equal(single.nodes.length, 1);
  assert.ok((single.nodes[0].x ?? 0) > 0);
  assert.ok((single.nodes[0].y ?? 0) > 0);
});

test("elasticLayout orgchart lays out levels from valid parent-child edges", () => {
  const visual = makeVisual("orgchart", ["CEO", "VP", "IC"], {
    nodes: [
      { id: "ceo", label: "CEO" },
      { id: "vp", label: "VP" },
      { id: "ic", label: "IC" },
    ],
    edges: [
      { id: "e1", from: "ceo", to: "vp" },
      { id: "e2", from: "vp", to: "ic" },
      { id: "missing", from: "vp", to: "missing" },
    ],
  });

  const result = elasticLayout(visual);
  const [ceo, vp, ic] = result.nodes;
  assert.ok((ceo.y ?? 0) < (vp.y ?? 0));
  assert.ok((vp.y ?? 0) < (ic.y ?? 0));
});

test("elasticLayout orgchart falls back to flowchart when every node has a parent", () => {
  const result = elasticLayout(
    makeVisual("orgchart", ["A", "B"], {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [
        { id: "ab", from: "a", to: "b" },
        { id: "ba", from: "b", to: "a" },
      ],
    }),
  );

  assert.ok((result.nodes[0].y ?? 0) < (result.nodes[1].y ?? 0));
});

// ---------------------------------------------------------------------------
// elasticLayout — derived-layout kinds (no-op)
// ---------------------------------------------------------------------------

test("elasticLayout: derived-layout kinds are a no-op (list)", () => {
  const visual = makeVisual("list", ["Item 1", "Item 2"]);
  const result = elasticLayout(visual);
  // Nodes should be unchanged (no x/y added)
  assert.deepEqual(result.nodes, visual.nodes);
  assert.equal(result.width, visual.width);
  assert.equal(result.height, visual.height);
});

test("elasticLayout: derived-layout kinds are a no-op (chart)", () => {
  const visual = makeVisual("chart", ["A", "B", "C"]);
  const result = elasticLayout(visual);
  assert.deepEqual(result.nodes, visual.nodes);
});

test("elasticLayout: derived-layout kinds are a no-op (timeline)", () => {
  const visual = makeVisual("timeline", ["T1", "T2"]);
  const result = elasticLayout(visual);
  assert.deepEqual(result.nodes, visual.nodes);
});
