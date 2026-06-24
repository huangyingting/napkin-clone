import assert from "node:assert/strict";
import test from "node:test";

import type { ElementBox, ShapeElement, SlideElement } from "./deck";
import {
  anchorPoint,
  connectorAnchorCandidates,
  lineBoxFromEndpoints,
  lineEndpoints,
  resolveConnectorEndpoint,
  resolveLineEndpoints,
  snapLineEndpoint,
} from "./connector-geometry";

function shape(
  id: string,
  box: ElementBox,
  overrides: Partial<ShapeElement> = {},
): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#000000",
    zIndex: 0,
    box,
    ...overrides,
  };
}

const resolveBox = (element: SlideElement) => element.box;

test("anchorPoint returns named anchor positions", () => {
  const box = { x: 10, y: 20, w: 30, h: 40 };

  assert.deepEqual(anchorPoint(box, "center"), { x: 25, y: 40 });
  assert.deepEqual(anchorPoint(box, "top"), { x: 25, y: 20 });
  assert.deepEqual(anchorPoint(box, "bottom"), { x: 25, y: 60 });
  assert.deepEqual(anchorPoint(box, "left"), { x: 10, y: 40 });
  assert.deepEqual(anchorPoint(box, "right"), { x: 40, y: 40 });
});

test("lineEndpoints and lineBoxFromEndpoints round-trip an unrotated line", () => {
  const box = { x: 10, y: 20, w: 40, h: 2 };
  const endpoints = lineEndpoints(box, undefined, 16 / 9);

  assert.deepEqual(endpoints, {
    start: { x: 10, y: 21 },
    end: { x: 50, y: 21 },
  });
  assert.deepEqual(
    lineBoxFromEndpoints(endpoints.start, endpoints.end, 2, 16 / 9),
    {
      box,
    },
  );
});

test("snapLineEndpoint returns the closest eligible anchor binding", () => {
  const target = shape("target", { x: 20, y: 20, w: 20, h: 20 });
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const snapped = snapLineEndpoint(
    { x: 39, y: 31 },
    line.id,
    [target, line],
    resolveBox,
    16 / 9,
  );

  assert.deepEqual(snapped, {
    point: { x: 40, y: 30 },
    binding: { elementId: "target", anchor: "right" },
  });
});

// ---------------------------------------------------------------------------
// anchorPoint – additional coverage
// ---------------------------------------------------------------------------

test("anchorPoint computes correct positions for a large box", () => {
  const box = { x: 100, y: 200, w: 300, h: 400 };

  assert.deepEqual(anchorPoint(box, "center"), { x: 250, y: 400 });
  assert.deepEqual(anchorPoint(box, "top"), { x: 250, y: 200 });
  assert.deepEqual(anchorPoint(box, "bottom"), { x: 250, y: 600 });
  assert.deepEqual(anchorPoint(box, "left"), { x: 100, y: 400 });
  assert.deepEqual(anchorPoint(box, "right"), { x: 400, y: 400 });
});

test("anchorPoint collapses all anchors to the same point for a zero-size box", () => {
  const box = { x: 5, y: 5, w: 0, h: 0 };
  const expected = { x: 5, y: 5 };

  for (const anchor of ["center", "top", "bottom", "left", "right"] as const) {
    assert.deepEqual(anchorPoint(box, anchor), expected, `anchor: ${anchor}`);
  }
});

// ---------------------------------------------------------------------------
// resolveConnectorEndpoint
// ---------------------------------------------------------------------------

test("resolveConnectorEndpoint returns null for an undefined endpoint", () => {
  assert.strictEqual(resolveConnectorEndpoint(undefined, [], resolveBox), null);
});

test("resolveConnectorEndpoint returns null when the referenced element is not found", () => {
  const endpoint = { elementId: "missing", anchor: "center" as const };
  assert.strictEqual(resolveConnectorEndpoint(endpoint, [], resolveBox), null);
});

test("resolveConnectorEndpoint resolves the correct anchor position on a matching element", () => {
  const s = shape("s1", { x: 10, y: 10, w: 20, h: 20 });
  // right anchor of s1: { x: 30, y: 20 }
  assert.deepEqual(
    resolveConnectorEndpoint(
      { elementId: "s1", anchor: "right" },
      [s],
      resolveBox,
    ),
    { x: 30, y: 20 },
  );
});

// ---------------------------------------------------------------------------
// resolveLineEndpoints – edge cases
// ---------------------------------------------------------------------------

test("resolveLineEndpoints returns box-based endpoints for a non-line shape", () => {
  const rect = shape("rect", { x: 10, y: 20, w: 40, h: 2 }, { shape: "rect" });

  const result = resolveLineEndpoints(rect, [rect], resolveBox, 16 / 9);
  // box-based horizontal line with rotation=undefined → midpoints along y=21
  assert.deepEqual(result, {
    start: { x: 10, y: 21 },
    end: { x: 50, y: 21 },
  });
});

test("resolveLineEndpoints returns box-based endpoints for a line with no connector binding", () => {
  const line = shape("line", { x: 10, y: 20, w: 40, h: 2 }, { shape: "line" });

  const result = resolveLineEndpoints(line, [line], resolveBox, 16 / 9);
  assert.deepEqual(result, {
    start: { x: 10, y: 21 },
    end: { x: 50, y: 21 },
  });
});

// ---------------------------------------------------------------------------
// lineBoxFromEndpoints – edge cases
// ---------------------------------------------------------------------------

test("lineBoxFromEndpoints clamps zero-length line to minimum width of 1", () => {
  const point = { x: 20, y: 30 };
  const result = lineBoxFromEndpoints(point, point, 2, 16 / 9);

  assert.strictEqual(result.box.w, 1);
  assert.strictEqual(result.box.h, 2);
  // box should be centered on the coincident point
  assert.strictEqual(result.box.x, 19.5);
  assert.strictEqual(result.box.y, 29);
});

test("lineBoxFromEndpoints encodes rotation for a diagonal line and round-trips with lineEndpoints", () => {
  // Diagonal line at aspect=1 from (0,0) to (3,4) → 3-4-5 triangle → width=5
  const start = { x: 0, y: 0 };
  const end = { x: 3, y: 4 };
  const aspect = 1;
  const heightPct = 2;

  const result = lineBoxFromEndpoints(start, end, heightPct, aspect);

  // Width must equal the Euclidean diagonal distance
  assert.ok(
    Math.abs(result.box.w - 5) < 1e-10,
    `expected width≈5, got ${result.box.w}`,
  );
  // rotation field must be present (line is not horizontal)
  assert.ok(result.rotation !== undefined, "expected a rotation value");
  // Verify round-trip: lineEndpoints should recover start/end within floating-point error
  const recovered = lineEndpoints(result.box, result.rotation, aspect);
  assert.ok(
    Math.abs(recovered.start.x - start.x) < 0.5 &&
      Math.abs(recovered.start.y - start.y) < 0.5,
    `start mismatch: got (${recovered.start.x}, ${recovered.start.y})`,
  );
  assert.ok(
    Math.abs(recovered.end.x - end.x) < 0.5 &&
      Math.abs(recovered.end.y - end.y) < 0.5,
    `end mismatch: got (${recovered.end.x}, ${recovered.end.y})`,
  );
});

// ---------------------------------------------------------------------------
// lineEndpoints – aspect ratio variants
// ---------------------------------------------------------------------------

test("lineEndpoints and lineBoxFromEndpoints round-trip an unrotated line at 4:3 aspect", () => {
  const box = { x: 10, y: 20, w: 30, h: 2 };
  const aspect = 4 / 3;
  const endpoints = lineEndpoints(box, undefined, aspect);

  assert.deepEqual(endpoints, {
    start: { x: 10, y: 21 },
    end: { x: 40, y: 21 },
  });
  assert.deepEqual(
    lineBoxFromEndpoints(endpoints.start, endpoints.end, 2, aspect),
    {
      box,
    },
  );
});

// ---------------------------------------------------------------------------
// snapLineEndpoint – additional edge cases
// ---------------------------------------------------------------------------

test("snapLineEndpoint returns the original point unchanged when no anchor is within threshold", () => {
  // target is far from the snap point — all anchors well beyond default threshold of 5%
  const farTarget = shape("far", { x: 80, y: 80, w: 10, h: 10 });
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const result = snapLineEndpoint(
    { x: 5, y: 5 },
    line.id,
    [farTarget, line],
    resolveBox,
    16 / 9,
  );

  assert.deepEqual(result.point, { x: 5, y: 5 });
  assert.strictEqual(result.binding, undefined);
});

test("snapLineEndpoint selects the nearest anchor when multiple candidates are within threshold", () => {
  // nearShape.right is at {x:24, y:10}; farShape.right is at {x:25, y:10}.
  // Point at {x:23, y:10}.  Both are within the default 5-unit threshold.
  // nearShape should win (distance ≈ 1.78 vs ≈ 3.56 at 16/9 aspect).
  const nearShape = shape("near", { x: 4, y: 0, w: 20, h: 20 });
  const farShape = shape("far", { x: 5, y: 0, w: 20, h: 20 });
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const result = snapLineEndpoint(
    { x: 23, y: 10 },
    line.id,
    [nearShape, farShape, line],
    resolveBox,
    16 / 9,
  );

  assert.deepEqual(result.point, { x: 24, y: 10 });
  assert.deepEqual(result.binding, { elementId: "near", anchor: "right" });
});

test("snapLineEndpoint excludes the line itself from snap candidates", () => {
  // Only element is the line itself; snap should return the original point.
  const line = shape("line", { x: 10, y: 10, w: 10, h: 2 }, { shape: "line" });

  const result = snapLineEndpoint(
    { x: 15, y: 11 },
    line.id,
    [line],
    resolveBox,
    16 / 9,
  );

  assert.deepEqual(result.point, { x: 15, y: 11 });
  assert.strictEqual(result.binding, undefined);
});

test("snapLineEndpoint excludes other line shapes from snap candidates", () => {
  // A second line element should not be a snap target.
  const otherLine = shape(
    "other-line",
    { x: 14, y: 10, w: 10, h: 2 },
    { shape: "line" },
  );
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const result = snapLineEndpoint(
    { x: 15, y: 11 },
    line.id,
    [otherLine, line],
    resolveBox,
    16 / 9,
  );

  assert.deepEqual(result.point, { x: 15, y: 11 });
  assert.strictEqual(result.binding, undefined);
});

test("connectorAnchorCandidates returns all hovered and near-anchor targets", () => {
  const containing = shape("containing", { x: 10, y: 10, w: 30, h: 20 });
  const nearAnchor = shape("near-anchor", { x: 40, y: 10, w: 10, h: 10 });
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const candidates = connectorAnchorCandidates(
    { x: 38, y: 18 },
    line.id,
    [containing, nearAnchor, line],
    resolveBox,
    1,
  );

  assert.deepEqual(
    candidates.map((candidate) => ({
      elementId: candidate.elementId,
      hoveredAnchor: candidate.hoveredAnchor,
      containsPoint: candidate.containsPoint,
    })),
    [
      { elementId: "containing", hoveredAnchor: "right", containsPoint: true },
      {
        elementId: "near-anchor",
        hoveredAnchor: "left",
        containsPoint: false,
      },
    ],
  );
});

test("connectorAnchorCandidates shows box-contained targets even without a snapped anchor", () => {
  const target = shape("target", { x: 10, y: 10, w: 40, h: 40 });
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const candidates = connectorAnchorCandidates(
    { x: 27, y: 27 },
    line.id,
    [target, line],
    resolveBox,
    1,
    2,
  );

  assert.deepEqual(candidates, [
    {
      elementId: "target",
      hoveredAnchor: null,
      distance: Math.sqrt(18),
      containsPoint: true,
    },
  ]);
});

test("connectorAnchorCandidates excludes connectors, the active line, and other line shapes", () => {
  const connector: SlideElement = {
    id: "connector",
    kind: "connector",
    start: { x: 10, y: 10 },
    end: { x: 20, y: 20 },
    zIndex: 0,
    box: { x: 10, y: 10, w: 10, h: 10 },
  };
  const otherLine = shape(
    "other-line",
    { x: 10, y: 10, w: 10, h: 2 },
    { shape: "line" },
  );
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const candidates = connectorAnchorCandidates(
    { x: 15, y: 15 },
    line.id,
    [connector, otherLine, line],
    resolveBox,
    1,
  );

  assert.deepEqual(candidates, []);
});
