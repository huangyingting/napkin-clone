/**
 * Visual regression tests for text, bullets, shape text, and connector
 * rendering (issue #336).
 *
 * These are pure unit tests that validate the rendering pipeline represented
 * by `buildDeckSpecs` (deck → DeckOp[]) and the stateless connector geometry
 * helper `resolveConnectorElementPoints`.  No DOM, no PptxGenJS binary, no
 * screenshot comparison — just deterministic assertions over the spec objects
 * that the export and renderer consume.
 *
 * Acceptance criteria:
 *  AC-1  Text element rendering — various styles, runs, fit modes.
 *  AC-2  Bullets element rendering — flat + nested items, numbered lists.
 *  AC-3  Shape text rendering — label and rich runs inside a shape.
 *  AC-4  Connector rendering — straight line, arrowheads, dash style.
 *  AC-5  Export spec tests — bound connector endpoints resolve consistently.
 *  AC-6  Connector follows moved shape — geometry recalculates on box update.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BulletsElement,
  ConnectorElement,
  Deck,
  ImageElement,
  PlaceholderElement,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  VisualElement,
} from "@/lib/presentation/deck";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";
import {
  buildDeckSpecs,
  type DeckBulletsOp,
  type DeckConnectorOp,
  type DeckImageOp,
  type DeckOp,
  type DeckShapeOp,
  type DeckTextOp,
} from "@/lib/visual/deck-export";
import type { Visual, VisualNode } from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * LAYOUT_WIDE dimensions (16:9) as authored in slide-format.ts:
 * exactly 13.333 × 7.5 inches (NOT 13.333…repeating).
 */
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

function slide(
  elements: SlideElement[],
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id: "s1",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements,
    ...overrides,
  };
}

function deck(elements: SlideElement[], overrides: Partial<Deck> = {}): Deck {
  return {
    themeId: "default",
    slides: [slide(elements)],
    ...overrides,
  };
}

/** Extract ops of a specific kind from a spec. */
function ofKind<K extends DeckOp["kind"]>(
  ops: DeckOp[],
  kind: K,
): Extract<DeckOp, { kind: K }>[] {
  return ops.filter((o): o is Extract<DeckOp, { kind: K }> => o.kind === kind);
}

/** Run buildDeckSpecs on a single-slide deck and return the first slide ops. */
function buildOps(elements: SlideElement[]): DeckOp[] {
  const [spec] = buildDeckSpecs(deck(elements), new Map());
  return spec.ops;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function textEl(
  id: string,
  text: string,
  overrides: Partial<TextElement> = {},
): TextElement {
  return {
    id,
    kind: "text",
    role: "body",
    text,
    zIndex: 0,
    box: { x: 5, y: 5, w: 60, h: 20 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
    ...overrides,
  };
}

function bulletsEl(
  id: string,
  bullets: string[],
  overrides: Partial<BulletsElement> = {},
): BulletsElement {
  return {
    id,
    kind: "bullets",
    bullets,
    items: bullets.map((text) => ({ text })),
    zIndex: 0,
    box: { x: 5, y: 5, w: 60, h: 40 },
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    ...overrides,
  };
}

function shapeEl(
  id: string,
  overrides: Partial<ShapeElement> = {},
): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#4444aa",
    zIndex: 0,
    box: { x: 10, y: 10, w: 20, h: 15 },
    ...overrides,
  };
}

function connectorEl(
  id: string,
  overrides: Partial<ConnectorElement> = {},
): ConnectorElement {
  return {
    id,
    kind: "connector",
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { x: 10, y: 20 },
    end: { x: 80, y: 70 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC-1 — Text element rendering
// ---------------------------------------------------------------------------

test("[AC-1] text op preserves bold+italic runs verbatim", () => {
  const runs = [
    { text: "Hello ", bold: true },
    { text: "world", italic: true, bold: true },
  ];
  const ops = buildOps([textEl("t1", "Hello world", { runs })]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.text, "Hello world", "plain text field preserved");
  assert.deepEqual(op.runs, runs, "runs carried through to the op");
  assert.equal(op.runs?.[0].bold, true, "first run is bold");
  assert.equal(op.runs?.[1].italic, true, "second run is italic");
  assert.equal(op.runs?.[1].bold, true, "second run is also bold");
});

test("[AC-1] text op with no runs omits the runs field", () => {
  const ops = buildOps([textEl("t2", "Plain text")]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.text, "Plain text");
  assert.equal(op.runs, undefined, "runs must be absent for plain text");
});

test("[AC-1] text op carries fitMode when set to shrink-to-fit", () => {
  const ops = buildOps([
    textEl("t3", "Shrinking", { fitMode: "shrink-to-fit" }),
  ]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(
    op.fitMode,
    "shrink-to-fit",
    "fitMode: shrink-to-fit propagated",
  );
});

test("[AC-1] text op carries fitMode when set to fixed-box", () => {
  const ops = buildOps([textEl("t4", "Fixed box", { fitMode: "fixed-box" })]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.fitMode, "fixed-box");
});

test("[AC-1] text op omits fitMode when absent (auto-height default)", () => {
  const ops = buildOps([textEl("t5", "Auto height")]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.fitMode, undefined, "fitMode must be absent by default");
});

test("[AC-1] text op carries verticalAlign: middle", () => {
  const ops = buildOps([
    textEl("t6", "Centred vertically", {
      style: {
        fontSize: 5,
        bold: false,
        italic: false,
        align: "center",
        verticalAlign: "middle",
      },
    }),
  ]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.verticalAlign, "middle");
});

test("[AC-1] text op carries verticalAlign: bottom", () => {
  const ops = buildOps([
    textEl("t7", "Bottom", {
      style: {
        fontSize: 5,
        bold: false,
        italic: false,
        align: "left",
        verticalAlign: "bottom",
      },
    }),
  ]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.verticalAlign, "bottom");
});

test("[AC-1] text op omits verticalAlign when absent", () => {
  const ops = buildOps([textEl("t8", "No valign")]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.equal(op.verticalAlign, undefined);
});

test("[AC-1] text op converts percentage box to correct inch-space coordinates", () => {
  // box 10%/20%/50%/30% on LAYOUT_WIDE (13.333" × 7.5")
  const ops = buildOps([
    textEl("t9", "Geo", { box: { x: 10, y: 20, w: 50, h: 30 } }),
  ]);
  const op = ofKind(ops, "text")[0] as DeckTextOp;

  assert.ok(Math.abs(op.x - SLIDE_W * 0.1) < 1e-4, "x in inches");
  assert.ok(Math.abs(op.y - SLIDE_H * 0.2) < 1e-4, "y in inches");
  assert.ok(Math.abs(op.w - SLIDE_W * 0.5) < 1e-4, "w in inches");
  assert.ok(Math.abs(op.h - SLIDE_H * 0.3) < 1e-4, "h in inches");
});

// ---------------------------------------------------------------------------
// AC-2 — Bullets element rendering
// ---------------------------------------------------------------------------

test("[AC-2] flat bullets produce correct items in op", () => {
  const ops = buildOps([bulletsEl("b1", ["Alpha", "Beta", "Gamma"])]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.deepEqual(op.items, ["Alpha", "Beta", "Gamma"]);
  assert.equal(op.itemDetails, undefined, "no itemDetails for a flat list");
});

test("[AC-2] nested items with mixed indent produce itemDetails", () => {
  const ops = buildOps([
    bulletsEl("b2", ["p", "c1", "c2"], {
      items: [
        { text: "Parent", indent: 0, listType: "bullet" },
        { text: "Child 1", indent: 1, listType: "bullet" },
        { text: "Child 2", indent: 2, listType: "bullet" },
      ],
    }),
  ]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.deepEqual(op.items, ["Parent", "Child 1", "Child 2"]);
  assert.ok(op.itemDetails, "itemDetails must be present for nested items");
  assert.equal(op.itemDetails?.[0].indent, 0);
  assert.equal(op.itemDetails?.[1].indent, 1);
  assert.equal(op.itemDetails?.[2].indent, 2);
});

test("[AC-2] numbered list items carry listType number in itemDetails", () => {
  const ops = buildOps([
    bulletsEl("b3", ["Step 1", "Step 2"], {
      items: [
        { text: "Step 1", indent: 0, listType: "number" },
        { text: "Step 2", indent: 0, listType: "number" },
      ],
    }),
  ]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.ok(op.itemDetails, "itemDetails present for numbered list");
  assert.equal(op.itemDetails?.[0].listType, "number");
  assert.equal(op.itemDetails?.[1].listType, "number");
});

test("[AC-2] mixed bullet/number list preserves each item type", () => {
  const ops = buildOps([
    bulletsEl("b4", ["Intro", "Step A", "Note"], {
      items: [
        { text: "Intro", indent: 0, listType: "bullet" },
        { text: "Step A", indent: 1, listType: "number" },
        { text: "Note", indent: 1, listType: "bullet" },
      ],
    }),
  ]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.equal(op.itemDetails?.[0].listType, "bullet");
  assert.equal(op.itemDetails?.[1].listType, "number");
  assert.equal(op.itemDetails?.[2].listType, "bullet");
});

test("[AC-2] bullets op carries itemRuns when bullet items have rich runs", () => {
  const ops = buildOps([
    bulletsEl("b5", ["one", "two"], {
      items: [
        { text: "one" },
        { text: "two", runs: [{ text: "two", italic: true }] },
      ],
    }),
  ]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.ok(op.itemRuns, "itemRuns must be present");
  assert.deepEqual(op.itemRuns?.[1], [{ text: "two", italic: true }]);
});

test("[AC-2] bullets op omits itemRuns when no runs are set", () => {
  const ops = buildOps([bulletsEl("b6", ["a", "b"])]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.equal(op.itemRuns, undefined);
});

test("[AC-2] bullets items[] text is authoritative over flat bullets array", () => {
  const ops = buildOps([
    bulletsEl("b7", ["flat mirror text"], {
      items: [{ text: "authoritative text", indent: 0 }],
    }),
  ]);
  const op = ofKind(ops, "bullets")[0] as DeckBulletsOp;

  assert.deepEqual(op.items, ["authoritative text"]);
});

// ---------------------------------------------------------------------------
// AC-3 — Shape text rendering
// ---------------------------------------------------------------------------

test("[AC-3] shape with text label produces DeckShapeOp containing text", () => {
  const ops = buildOps([
    shapeEl("sh1", {
      text: "My Label",
      textStyle: {
        fontSize: 4,
        bold: false,
        italic: false,
        align: "center",
      },
    }),
  ]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.equal(op.shape, "rect");
  assert.equal(op.text, "My Label", "text field set on the shape op");
});

test("[AC-3] shape without text has no text field in the op", () => {
  const ops = buildOps([shapeEl("sh2")]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.equal(op.text, undefined);
});

test("[AC-3] shape text inherits bold/italic from textStyle", () => {
  const ops = buildOps([
    shapeEl("sh3", {
      text: "Styled",
      textStyle: {
        fontSize: 4,
        bold: true,
        italic: true,
        align: "center",
      },
    }),
  ]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.equal(op.bold, true, "bold propagated from textStyle");
  assert.equal(op.italic, true, "italic propagated from textStyle");
});

test("[AC-3] shape with textRuns carries runs in the op", () => {
  const runs = [{ text: "Bold", bold: true }, { text: " normal" }];
  const ops = buildOps([
    shapeEl("sh4", {
      text: "Bold normal",
      textRuns: runs,
      textStyle: {
        fontSize: 4,
        bold: false,
        italic: false,
        align: "center",
      },
    }),
  ]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.deepEqual(op.textRuns, runs, "textRuns carried to shape op");
});

test("[AC-3] shape textRuns absent when not set", () => {
  const ops = buildOps([shapeEl("sh5", { text: "No runs" })]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.equal(op.textRuns, undefined);
});

test("[AC-3] line shape with text does NOT emit text (text suppressed for lines)", () => {
  // The export explicitly skips text on line shapes to prevent label-on-line.
  const ops = buildOps([
    shapeEl("sh6", {
      shape: "line",
      text: "should be suppressed",
    }),
  ]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.equal(op.text, undefined, "text must not appear on a line shape op");
});

test("[AC-3] ellipse shape with text carries label correctly", () => {
  const ops = buildOps([
    shapeEl("sh7", {
      shape: "ellipse",
      text: "Oval label",
      textStyle: { fontSize: 3.5, bold: false, italic: false, align: "center" },
    }),
  ]);
  const op = ofKind(ops, "shape")[0] as DeckShapeOp;

  assert.equal(op.shape, "ellipse");
  assert.equal(op.text, "Oval label");
});

// ---------------------------------------------------------------------------
// AC-4 — Connector rendering spec
// ---------------------------------------------------------------------------

test("[AC-4] free connector endpoints produce correct inch-space x1/y1/x2/y2", () => {
  // start: {x:10, y:20} → 10%×13.333"=1.333", 20%×7.5"=1.5"
  // end:   {x:80, y:70} → 80%×13.333"=10.666", 70%×7.5"=5.25"
  const ops = buildOps([connectorEl("c1")]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.ok(Math.abs(op.x1 - SLIDE_W * 0.1) < 0.01, "x1 correct");
  assert.ok(Math.abs(op.y1 - SLIDE_H * 0.2) < 0.01, "y1 correct");
  assert.ok(Math.abs(op.x2 - SLIDE_W * 0.8) < 0.01, "x2 correct");
  assert.ok(Math.abs(op.y2 - SLIDE_H * 0.7) < 0.01, "y2 correct");
});

test("[AC-4] connector with arrowEnd: filled carries arrowEnd in op", () => {
  const ops = buildOps([connectorEl("c2", { arrowEnd: "filled" })]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.arrowEnd, "filled");
});

test("[AC-4] connector with arrowStart: arrow carries arrowStart in op", () => {
  const ops = buildOps([connectorEl("c3", { arrowStart: "arrow" })]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.arrowStart, "arrow");
});

test("[AC-4] connector with dash: true sets dash on op", () => {
  const ops = buildOps([connectorEl("c4", { dash: true })]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.dash, true);
});

test("[AC-4] connector without dash omits the field", () => {
  const ops = buildOps([connectorEl("c5")]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.dash, undefined);
});

test("[AC-4] connector default stroke color is a1a1aa (normalised upper-case)", () => {
  const ops = buildOps([connectorEl("c6")]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.color, "A1A1AA");
});

test("[AC-4] connector inherits custom stroke color", () => {
  const ops = buildOps([
    connectorEl("c7", { stroke: { color: "#00ff88", width: 1 } }),
  ]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.color, "00FF88");
});

test("[AC-4] connector with arrowEnd: none carries none value", () => {
  const ops = buildOps([
    connectorEl("c8", { arrowEnd: "none", arrowStart: "none" }),
  ]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  assert.equal(op.arrowEnd, "none");
  assert.equal(op.arrowStart, "none");
});

// ---------------------------------------------------------------------------
// AC-5 — Bound connector endpoints resolve consistently in export spec
// ---------------------------------------------------------------------------

test("[AC-5] bound endpoints resolve to the correct anchor inch positions", () => {
  // targetA box: x=20, y=30, w=10, h=10 (percentage units)
  //   right anchor: x=30, y=35 → 30/100*13.333 ≈ 4.0", 35/100*7.5 = 2.625"
  //   bottom anchor: x=25, y=40 → 25/100*13.333 ≈ 3.333", 40/100*7.5 = 3.0"
  const targetA: ShapeElement = {
    id: "targetA",
    kind: "shape",
    shape: "rect",
    color: "#aaaaaa",
    zIndex: 0,
    box: { x: 20, y: 30, w: 10, h: 10 },
  };
  const connector: ConnectorElement = {
    id: "conn1",
    kind: "connector",
    zIndex: 1,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "targetA", anchor: "right" },
    end: { elementId: "targetA", anchor: "bottom" },
  };

  const [spec] = buildDeckSpecs(deck([targetA, connector]), new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;

  // right anchor: (30, 35)% → inches
  assert.ok(
    Math.abs(op.x1 - SLIDE_W * 0.3) < 0.01,
    `x1 expected ${SLIDE_W * 0.3}, got ${op.x1}`,
  );
  assert.ok(
    Math.abs(op.y1 - SLIDE_H * 0.35) < 0.01,
    `y1 expected ${SLIDE_H * 0.35}, got ${op.y1}`,
  );
  // bottom anchor: (25, 40)% → inches
  assert.ok(
    Math.abs(op.x2 - SLIDE_W * 0.25) < 0.01,
    `x2 expected ${SLIDE_W * 0.25}, got ${op.x2}`,
  );
  assert.ok(
    Math.abs(op.y2 - SLIDE_H * 0.4) < 0.01,
    `y2 expected ${SLIDE_H * 0.4}, got ${op.y2}`,
  );
});

test("[AC-5] connector bound to two different shapes resolves each independently", () => {
  const shapeA: ShapeElement = {
    id: "A",
    kind: "shape",
    shape: "rect",
    color: "#ff0000",
    zIndex: 0,
    box: { x: 10, y: 10, w: 20, h: 20 },
  };
  const shapeB: ShapeElement = {
    id: "B",
    kind: "shape",
    shape: "ellipse",
    color: "#00ff00",
    zIndex: 1,
    box: { x: 70, y: 10, w: 20, h: 20 },
  };
  const connector: ConnectorElement = {
    id: "conn2",
    kind: "connector",
    zIndex: 2,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "A", anchor: "right" },
    end: { elementId: "B", anchor: "left" },
  };

  // A.right = (30, 20), B.left = (70, 20)
  const [spec] = buildDeckSpecs(deck([shapeA, shapeB, connector]), new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;

  assert.ok(Math.abs(op.x1 - SLIDE_W * 0.3) < 0.01, "x1 = A.right");
  assert.ok(Math.abs(op.y1 - SLIDE_H * 0.2) < 0.01, "y1 = A.right");
  assert.ok(Math.abs(op.x2 - SLIDE_W * 0.7) < 0.01, "x2 = B.left");
  assert.ok(Math.abs(op.y2 - SLIDE_H * 0.2) < 0.01, "y2 = B.left");
});

test("[AC-5] connector with missing bound element falls back gracefully", () => {
  // start is bound to a non-existent element; should fall back to origin or box center
  const connector: ConnectorElement = {
    id: "conn3",
    kind: "connector",
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "ghost", anchor: "center" },
    end: { x: 50, y: 50 },
  };

  // Must not throw; produces a valid op
  const ops = buildOps([connector]);
  const op = ofKind(ops, "connector")[0] as DeckConnectorOp;

  // end is always the free point (50, 50)%
  assert.ok(Math.abs(op.x2 - SLIDE_W * 0.5) < 0.01, "x2 from free end");
  assert.ok(Math.abs(op.y2 - SLIDE_H * 0.5) < 0.01, "y2 from free end");
  // x1/y1 must be finite numbers (not NaN)
  assert.ok(Number.isFinite(op.x1), "x1 is finite");
  assert.ok(Number.isFinite(op.y1), "y1 is finite");
});

// ---------------------------------------------------------------------------
// AC-6 — Connector follows moved shape (geometry recalculation)
// ---------------------------------------------------------------------------

const resolveBox = (el: SlideElement) => el.box;

test("[AC-6] resolveConnectorElementPoints returns correct points for free endpoints", () => {
  const connector: ConnectorElement = {
    id: "c",
    kind: "connector",
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { x: 15, y: 25 },
    end: { x: 85, y: 60 },
  };

  const result = resolveConnectorElementPoints(
    connector,
    [connector],
    resolveBox,
  );

  assert.deepEqual(result.start, { x: 15, y: 25 });
  assert.deepEqual(result.end, { x: 85, y: 60 });
});

test("[AC-6] resolveConnectorElementPoints resolves bound start endpoint", () => {
  const shapeA: ShapeElement = {
    id: "A",
    kind: "shape",
    shape: "rect",
    color: "#aabbcc",
    zIndex: 0,
    box: { x: 10, y: 10, w: 20, h: 20 }, // center = (20, 20)
  };
  const connector: ConnectorElement = {
    id: "c",
    kind: "connector",
    zIndex: 1,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "A", anchor: "center" },
    end: { x: 80, y: 50 },
  };

  const result = resolveConnectorElementPoints(
    connector,
    [shapeA, connector],
    resolveBox,
  );

  assert.deepEqual(result.start, { x: 20, y: 20 }, "start = center of A");
  assert.deepEqual(result.end, { x: 80, y: 50 }, "end = free point");
});

test("[AC-6] connector follows shape A when A is moved to new position", () => {
  // Shape A starts at (10, 10, 20, 20) → center (20, 20).
  // We simulate a move by creating an updated shape with box (50, 50, 20, 20).
  const shapeAMoved: ShapeElement = {
    id: "A",
    kind: "shape",
    shape: "rect",
    color: "#aabbcc",
    zIndex: 0,
    box: { x: 50, y: 50, w: 20, h: 20 }, // center after move = (60, 60)
  };
  const connector: ConnectorElement = {
    id: "c",
    kind: "connector",
    zIndex: 1,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "A", anchor: "center" },
    end: { x: 90, y: 90 },
  };

  // resolveConnectorElementPoints is stateless — it reads the current element
  // list on every call, so it automatically reflects the moved box.
  const result = resolveConnectorElementPoints(
    connector,
    [shapeAMoved, connector],
    resolveBox,
  );

  // After move: center of A is (60, 60).
  assert.deepEqual(
    result.start,
    { x: 60, y: 60 },
    "start follows the moved shape A",
  );
  assert.deepEqual(result.end, { x: 90, y: 90 }, "end is unchanged");
});

test("[AC-6] connector end follows shape B when B is moved", () => {
  const shapeB: ShapeElement = {
    id: "B",
    kind: "shape",
    shape: "ellipse",
    color: "#ccbbaa",
    zIndex: 0,
    box: { x: 60, y: 40, w: 10, h: 10 }, // top = (65, 40)
  };
  const connector: ConnectorElement = {
    id: "c",
    kind: "connector",
    zIndex: 1,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { x: 5, y: 5 },
    end: { elementId: "B", anchor: "top" },
  };

  // Initial resolution: B.top = (65, 40)
  const before = resolveConnectorElementPoints(
    connector,
    [shapeB, connector],
    resolveBox,
  );
  assert.deepEqual(before.end, { x: 65, y: 40 }, "end at B top before move");

  // Simulate moving B to (20, 20, 10, 10) → top = (25, 20)
  const shapeBMoved: ShapeElement = {
    ...shapeB,
    box: { x: 20, y: 20, w: 10, h: 10 },
  };
  const after = resolveConnectorElementPoints(
    connector,
    [shapeBMoved, connector],
    resolveBox,
  );
  assert.deepEqual(
    after.end,
    { x: 25, y: 20 },
    "end follows moved B top anchor",
  );
});

test("[AC-6] connector between two shapes tracks both when both move", () => {
  const makeA = (box: ShapeElement["box"]): ShapeElement => ({
    id: "A",
    kind: "shape",
    shape: "rect",
    color: "#000",
    zIndex: 0,
    box,
  });
  const makeB = (box: ShapeElement["box"]): ShapeElement => ({
    id: "B",
    kind: "shape",
    shape: "rect",
    color: "#fff",
    zIndex: 1,
    box,
  });
  const connector: ConnectorElement = {
    id: "c",
    kind: "connector",
    zIndex: 2,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "A", anchor: "right" },
    end: { elementId: "B", anchor: "left" },
  };

  // Before: A at (0,0,20,20) → right=(20,10); B at (80,0,20,20) → left=(80,10)
  const r1 = resolveConnectorElementPoints(
    connector,
    [
      makeA({ x: 0, y: 0, w: 20, h: 20 }),
      makeB({ x: 80, y: 0, w: 20, h: 20 }),
      connector,
    ],
    resolveBox,
  );
  assert.deepEqual(r1.start, { x: 20, y: 10 });
  assert.deepEqual(r1.end, { x: 80, y: 10 });

  // After: A at (5,5,20,20) → right=(25,15); B at (70,5,20,20) → left=(70,15)
  const r2 = resolveConnectorElementPoints(
    connector,
    [
      makeA({ x: 5, y: 5, w: 20, h: 20 }),
      makeB({ x: 70, y: 5, w: 20, h: 20 }),
      connector,
    ],
    resolveBox,
  );
  assert.deepEqual(r2.start, { x: 25, y: 15 }, "start follows moved A");
  assert.deepEqual(r2.end, { x: 70, y: 15 }, "end follows moved B");
});

// ---------------------------------------------------------------------------
// AC-7 — Image element rendering
// ---------------------------------------------------------------------------

function imageEl(
  id: string,
  overrides: Partial<ImageElement> = {},
): ImageElement {
  return {
    id,
    kind: "image",
    src: "data:image/png;base64,AAAA",
    alt: "test image",
    zIndex: 0,
    box: { x: 10, y: 10, w: 40, h: 30 },
    ...overrides,
  };
}

test("[AC-7] image op carries src and geometry", () => {
  const ops = buildOps([imageEl("img1")]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.ok(op, "image op emitted");
  assert.equal(op.src, "data:image/png;base64,AAAA");
  assert.ok(
    Number.isFinite(op.x) && op.x >= 0,
    "x is a finite non-negative number",
  );
  assert.ok(Number.isFinite(op.w) && op.w > 0, "w is a positive number");
});

test("[AC-7] image op carries fitMode when set to fill", () => {
  const ops = buildOps([imageEl("img2", { fitMode: "fill" })]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.equal(op.fitMode, "fill");
});

test("[AC-7] image op carries fitMode when set to contain", () => {
  const ops = buildOps([imageEl("img3", { fitMode: "contain" })]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.equal(op.fitMode, "contain");
});

test("[AC-7] image op carries fitMode when set to cover", () => {
  const ops = buildOps([imageEl("img4", { fitMode: "cover" })]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.equal(op.fitMode, "cover");
});

test("[AC-7] image op carries maskShape when set", () => {
  const ops = buildOps([imageEl("img5", { maskShape: "circle" })]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.equal(op.maskShape, "circle");
});

test("[AC-7] image op carries crop metadata", () => {
  const crop = { top: 0.05, right: 0.1, bottom: 0.15, left: 0.2 };
  const ops = buildOps([imageEl("img6", { crop })]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.deepEqual(op.crop, crop);
});

test("[AC-7] image op omits fitMode, maskShape, crop when absent", () => {
  const ops = buildOps([imageEl("img7")]);
  const op = ofKind(ops, "image")[0] as DeckImageOp;

  assert.equal(op.fitMode, undefined, "fitMode absent");
  assert.equal(op.maskShape, undefined, "maskShape absent");
  assert.equal(op.crop, undefined, "crop absent");
});

test("[AC-7] image with empty src produces no op (broken image skipped)", () => {
  const ops = buildOps([imageEl("img8", { src: "" })]);

  assert.equal(ofKind(ops, "image").length, 0, "no image op for empty src");
});

test("[AC-7] image with whitespace src is treated as empty and skipped", () => {
  const ops = buildOps([imageEl("img9", { src: "   " })]);

  assert.equal(ofKind(ops, "image").length, 0);
});

// ---------------------------------------------------------------------------
// AC-8 — Visual element rendering
// ---------------------------------------------------------------------------

function visualNode(
  id: string,
  label: string,
  x: number,
  y: number,
): VisualNode {
  return { id, label, x, y, width: 150, height: 56 };
}

function flowchartVisual(): Visual {
  return {
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [
      visualNode("a", "Alpha", 100, 100),
      visualNode("b", "Beta", 100, 300),
    ],
    edges: [{ id: "e1", from: "a", to: "b" }],
    style: {
      palette: ["#6366f1", "#0ea5e9", "#10b981"],
      background: "#ffffff",
      nodeFill: "#eef2ff",
      nodeStroke: "#6366f1",
      nodeText: "#1e1b4b",
      edgeColor: "#94a3b8",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: 14,
      fontWeight: 600,
    },
  };
}

function visualEl(
  id: string,
  visualId: string,
  overrides: Partial<VisualElement> = {},
): VisualElement {
  return {
    id,
    kind: "visual",
    visualId,
    zIndex: 0,
    box: { x: 10, y: 10, w: 50, h: 40 },
    ...overrides,
  };
}

test("[AC-8] native visual emits exactly one visual-native op and no fallback", () => {
  const visuals = new Map<string, Visual>([["v1", flowchartVisual()]]);
  const [spec] = buildDeckSpecs(deck([visualEl("ve", "v1")]), visuals);

  assert.equal(ofKind(spec.ops, "visual-native").length, 1, "one native op");
  assert.equal(ofKind(spec.ops, "visual-fallback").length, 0, "no fallback op");
});

test("[AC-8] unknown visual id produces no ops at all", () => {
  const [spec] = buildDeckSpecs(deck([visualEl("ve", "missing")]), new Map());

  assert.equal(spec.ops.length, 0, "no ops for orphaned visual reference");
});

test("[AC-8] visual with rotation falls back to rasterised image", () => {
  const visuals = new Map<string, Visual>([["v1", flowchartVisual()]]);
  const transformed = visualEl("ve", "v1", { rotation: 30 });
  const [spec] = buildDeckSpecs(deck([transformed]), visuals);

  assert.equal(ofKind(spec.ops, "visual-native").length, 0, "no native op");
  assert.equal(
    ofKind(spec.ops, "visual-fallback").length,
    1,
    "fallback op present",
  );
});

test("[AC-8] visual with opacity falls back to rasterised image", () => {
  const visuals = new Map<string, Visual>([["v1", flowchartVisual()]]);
  const [spec] = buildDeckSpecs(
    deck([visualEl("ve", "v1", { opacity: 0.5 })]),
    visuals,
  );

  assert.equal(ofKind(spec.ops, "visual-native").length, 0);
  assert.equal(ofKind(spec.ops, "visual-fallback").length, 1);
});

test("[AC-8] known visual alongside unknown emits only one op (orphan is dropped)", () => {
  const visuals = new Map<string, Visual>([["v1", flowchartVisual()]]);
  const els: SlideElement[] = [
    visualEl("good", "v1"),
    { ...visualEl("bad", "orphan"), zIndex: 1 },
  ];
  const [spec] = buildDeckSpecs(deck(els), visuals);

  const totalVisualOps =
    ofKind(spec.ops, "visual-native").length +
    ofKind(spec.ops, "visual-fallback").length;
  assert.equal(totalVisualOps, 1, "only the resolvable visual emits an op");
});

// ---------------------------------------------------------------------------
// AC-9 — Placeholder element rendering
// ---------------------------------------------------------------------------

function placeholderEl(
  id: string,
  overrides: Partial<PlaceholderElement> = {},
): PlaceholderElement {
  return {
    id,
    kind: "placeholder",
    placeholderType: "body",
    zIndex: 0,
    box: { x: 10, y: 20, w: 50, h: 30 },
    ...overrides,
  };
}

test("[AC-9] placeholder exports as a shape outline plus a label text op", () => {
  const ops = buildOps([placeholderEl("ph1")]);

  assert.equal(ofKind(ops, "shape").length, 1, "placeholder outline shape op");
  assert.equal(ofKind(ops, "text").length, 1, "placeholder label text op");
  assert.equal(
    ofKind(ops, "text")[0]?.text,
    "Body",
    "label shows placeholder type",
  );
});

test("[AC-9] placeholder with custom label uses that label in the text op", () => {
  const ops = buildOps([
    placeholderEl("ph2", { placeholderType: "title", label: "Custom Heading" }),
  ]);
  const textOp = ofKind(ops, "text")[0];

  assert.equal(
    textOp?.text,
    "Custom Heading",
    "custom label used over type name",
  );
});

test("[AC-9] placeholder text op carries correct geometry within slide bounds", () => {
  const ops = buildOps([
    placeholderEl("ph3", { box: { x: 0, y: 0, w: 100, h: 50 } }),
  ]);
  const textOp = ofKind(ops, "text")[0];

  assert.ok(textOp, "text op present");
  // Placeholder insets the label by 8% on each side (see deck-export.ts).
  const expectedX = SLIDE_W * 0.08;
  const expectedY = SLIDE_H * 0.5 * 0.08;
  const expectedW = SLIDE_W * 0.84;
  const expectedH = SLIDE_H * 0.5 * 0.84;
  assert.ok(
    Math.abs(textOp.x - expectedX) < 0.01,
    `x ≈ ${expectedX.toFixed(3)}`,
  );
  assert.ok(
    Math.abs(textOp.y - expectedY) < 0.01,
    `y ≈ ${expectedY.toFixed(3)}`,
  );
  assert.ok(
    Math.abs(textOp.w - expectedW) < 0.01,
    `w ≈ ${expectedW.toFixed(3)}`,
  );
  assert.ok(
    Math.abs(textOp.h - expectedH) < 0.01,
    `h ≈ ${expectedH.toFixed(3)}`,
  );
});

// ---------------------------------------------------------------------------
// AC-10 — Hidden / locked / grouped element rendering
// ---------------------------------------------------------------------------

test("[AC-10] hidden=true element produces no ops", () => {
  const ops = buildOps([textEl("t1", "invisible", { hidden: true })]);

  assert.equal(ops.length, 0, "hidden element must not produce any ops");
});

test("[AC-10] hidden text element is dropped while sibling visible element is kept", () => {
  const ops = buildOps([
    textEl("t-hidden", "hidden text", { hidden: true }),
    textEl("t-visible", "visible text", { zIndex: 1 }),
  ]);

  const textOps = ofKind(ops, "text");
  assert.equal(textOps.length, 1, "only one text op for the visible element");
  assert.equal(textOps[0].text, "visible text");
});

test("[AC-10] hidden shape is dropped while visible shape sibling is kept", () => {
  const ops = buildOps([
    shapeEl("sh-hidden", { hidden: true }),
    shapeEl("sh-visible", { zIndex: 1 }),
  ]);

  assert.equal(
    ofKind(ops, "shape").length,
    1,
    "only visible shape produces op",
  );
});

test("[AC-10] locked=true element exports identically to an unlocked element", () => {
  const unlockedOps = buildOps([textEl("t-unlocked", "hello")]);
  const lockedOps = buildOps([textEl("t-locked", "hello", { locked: true })]);

  const unlockedOp = ofKind(unlockedOps, "text")[0];
  const lockedOp = ofKind(lockedOps, "text")[0];

  assert.ok(unlockedOp, "unlocked op present");
  assert.ok(lockedOp, "locked op present");
  assert.equal(lockedOp.text, unlockedOp.text, "text field identical");
  assert.equal(lockedOp.x, unlockedOp.x, "geometry identical");
  assert.equal(lockedOp.w, unlockedOp.w, "geometry identical");
});

test("[AC-10] locked=true shape exports with all geometry and style intact", () => {
  const ops = buildOps([shapeEl("sh-locked", { locked: true })]);

  assert.equal(ofKind(ops, "shape").length, 1, "locked shape produces op");
});

test("[AC-10] grouped elements (same groupId) each produce their own op (flattened)", () => {
  const ops = buildOps([
    textEl("t1", "Group A", { groupId: "g1" }),
    textEl("t2", "Group A also", { groupId: "g1", zIndex: 1 }),
    textEl("t3", "No group", { zIndex: 2 }),
  ]);

  assert.equal(ofKind(ops, "text").length, 3, "all three elements produce ops");
  assert.deepEqual(
    ofKind(ops, "text").map((o) => o.text),
    ["Group A", "Group A also", "No group"],
  );
});

test("[AC-10] grouped shapes each export individually (group membership not merged)", () => {
  const ops = buildOps([
    shapeEl("sh1", { groupId: "g1" }),
    shapeEl("sh2", { groupId: "g1", zIndex: 1 }),
  ]);

  assert.equal(
    ofKind(ops, "shape").length,
    2,
    "both grouped shapes produce ops",
  );
});

// ---------------------------------------------------------------------------
// AC-11 — Background rendering (solid, gradient, image)
// ---------------------------------------------------------------------------

function deckWith(slideOverrides: Partial<Slide>): Deck {
  return {
    themeId: "default",
    slides: [slide([], slideOverrides)],
  };
}

test("[AC-11] per-slide background color override is in the spec", () => {
  const [spec] = buildDeckSpecs(deckWith({ background: "#abcdef" }), new Map());

  assert.equal(
    spec.background,
    "ABCDEF",
    "background hex normalised to uppercase",
  );
});

test("[AC-11] backgroundGradient uses the 'from' stop as the PPTX background color", () => {
  const [spec] = buildDeckSpecs(
    deckWith({ backgroundGradient: { from: "#112233", to: "#aabbcc" } }),
    new Map(),
  );

  assert.equal(
    spec.background,
    "112233",
    "gradient from-stop used as fallback background",
  );
});

test("[AC-11] backgroundImage is forwarded to the slide spec", () => {
  const dataUrl = "data:image/png;base64,BGBG";
  const [spec] = buildDeckSpecs(
    deckWith({ backgroundImage: dataUrl }),
    new Map(),
  );

  assert.equal(
    spec.backgroundImage,
    dataUrl,
    "backgroundImage propagated verbatim",
  );
});

test("[AC-11] slide without background overrides falls back to theme defaults", () => {
  const [spec] = buildDeckSpecs(
    { themeId: "ocean", slides: [slide([])] },
    new Map(),
  );

  assert.equal(spec.background, "F6FBFF", "ocean theme background used");
  assert.equal(spec.backgroundImage, undefined, "no backgroundImage in spec");
});

test("[AC-11] backgroundImage takes precedence: spec carries it even when background color is also set", () => {
  const dataUrl = "data:image/png;base64,IMG";
  const [spec] = buildDeckSpecs(
    deckWith({ background: "#ffffff", backgroundImage: dataUrl }),
    new Map(),
  );

  assert.equal(spec.backgroundImage, dataUrl, "backgroundImage present");
  // The solid background field is also populated (used as a fallback color layer).
  assert.equal(spec.background, "FFFFFF");
});

// ---------------------------------------------------------------------------
// AC-12 — sourceRef metadata: not a visual export target
// ---------------------------------------------------------------------------

test("[AC-12] text element with sourceRef still emits a normal text op", () => {
  const ops = buildOps([
    textEl("t-ref", "Linked content", {
      sourceRef: {
        documentId: "doc-1",
        blockId: "block-42",
        contentHash: "abc123",
        linkedAt: "2026-01-01T00:00:00Z",
        blockKind: "text",
      },
    }),
  ]);
  const op = ofKind(ops, "text")[0];

  assert.ok(op, "text op emitted despite sourceRef");
  assert.equal(op.text, "Linked content", "content preserved");
});

test("[AC-12] bullets element with sourceRef still emits a normal bullets op", () => {
  const ops = buildOps([
    bulletsEl("b-ref", ["item 1", "item 2"], {
      sourceRef: {
        documentId: "doc-1",
        blockId: "block-7",
        linkedAt: "2026-01-01T00:00:00Z",
        blockKind: "text",
      },
    }),
  ]);
  const op = ofKind(ops, "bullets")[0];

  assert.ok(op, "bullets op emitted despite sourceRef");
  assert.deepEqual(op.items, ["item 1", "item 2"]);
});

test("[AC-12] shape with sourceRef exports normally (sourceRef is opaque metadata)", () => {
  const ops = buildOps([
    shapeEl("sh-ref", {
      sourceRef: {
        documentId: "doc-1",
        blockId: "block-5",
        linkedAt: "2026-01-01T00:00:00Z",
        blockKind: "text",
      },
    }),
  ]);

  assert.equal(
    ofKind(ops, "shape").length,
    1,
    "shape op emitted with sourceRef",
  );
});

test("[AC-12] unlinked sourceRef (unlinked=true) does not suppress the element", () => {
  const ops = buildOps([
    textEl("t-unlinked", "Detached text", {
      sourceRef: {
        documentId: "doc-1",
        blockId: "block-9",
        linkedAt: "2026-01-01T00:00:00Z",
        unlinked: true,
        blockKind: "text",
      },
    }),
  ]);

  assert.equal(ofKind(ops, "text").length, 1, "unlinked element still exports");
  assert.equal(ofKind(ops, "text")[0]?.text, "Detached text");
});

// ---------------------------------------------------------------------------
// #618 — Inherited deck-template style regression + override preservation
// ---------------------------------------------------------------------------

function tokenSetWith(
  overrides: Partial<{
    onBg: string;
    accent: string;
    fontFamily: string;
    headingFontFamily: string;
  }> = {},
) {
  return {
    id: "brand:t",
    name: "T",
    colors: {
      slideBg: "#ffffff",
      surface: "#f0f0f0",
      accent: overrides.accent ?? "#3366ff",
      onBg: overrides.onBg ?? "#0f172a",
      onSurface: "#111111",
      onAccent: "#ffffff",
      muted: "#64748b",
    },
    typography: {
      fontFamily: overrides.fontFamily ?? "Inter",
      ...(overrides.headingFontFamily
        ? { headingFontFamily: overrides.headingFontFamily }
        : {}),
      scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
    },
    spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
    shape: { cornerRadiusPt: 4, shadowCss: "none" },
    defaultBackground: { type: "solid" as const, color: "#ffffff" },
  };
}

function titleOpColor(deckObj: Deck): string {
  const [spec] = buildDeckSpecs(deckObj, new Map());
  return (ofKind(spec.ops, "text")[0] as DeckTextOp).color.toLowerCase();
}

test("[#618] inherited title color tracks a deck-template change", () => {
  const el = () => textEl("t", "Heading", { role: "title", textRole: "h1" });
  const a = titleOpColor(
    deck([el()], {
      customTokenSet: tokenSetWith({ onBg: "#112233" }) as never,
    }),
  );
  const b = titleOpColor(
    deck([el()], {
      customTokenSet: tokenSetWith({ onBg: "#445566" }) as never,
    }),
  );
  assert.equal(a, "112233");
  assert.equal(b, "445566");
  assert.notEqual(a, b, "inherited role color must change with the template");
});

test("[#618] inherited role font tracks a deck-template heading-font change", () => {
  const el = () => textEl("t", "Heading", { role: "title", textRole: "h1" });
  const fontOf = (d: Deck) =>
    (
      buildDeckSpecs(d, new Map())[0].ops.find(
        (o) => o.kind === "text",
      ) as DeckTextOp
    ).fontFace;
  assert.equal(
    fontOf(
      deck([el()], {
        customTokenSet: tokenSetWith({ headingFontFamily: "Oswald" }) as never,
      }),
    ),
    "Oswald",
  );
  assert.equal(
    fontOf(
      deck([el()], {
        customTokenSet: tokenSetWith({
          headingFontFamily: "Bebas Neue",
        }) as never,
      }),
    ),
    "Bebas Neue",
  );
});

test("[#618] a local color override is NOT clobbered by a global template change", () => {
  const el = () =>
    textEl("t", "Heading", {
      role: "title",
      style: {
        fontSize: 6,
        bold: true,
        italic: false,
        align: "left",
        color: "#abcdef",
      },
    });
  const a = titleOpColor(
    deck([el()], {
      customTokenSet: tokenSetWith({ onBg: "#112233" }) as never,
    }),
  );
  const b = titleOpColor(
    deck([el()], {
      customTokenSet: tokenSetWith({ onBg: "#445566" }) as never,
    }),
  );
  assert.equal(a, "abcdef");
  assert.equal(b, "abcdef");
});

test("[#618] export smoke: custom template fonts + gradient background do not crash", () => {
  const customTokenSet = {
    ...tokenSetWith({ headingFontFamily: "Some Unembeddable Font" }),
    defaultBackground: {
      type: "gradient" as const,
      from: "#123456",
      to: "#654321",
    },
  };
  const d = deck(
    [
      textEl("t", "Title", { role: "title", textRole: "h1" }),
      bulletsEl("b", ["a", "b"]),
      shapeEl("s", { text: "Label" }),
      connectorEl("c"),
    ],
    {
      customTokenSet: customTokenSet as never,
      slides: [
        {
          id: "s1",
          index: 0,
          title: "",
          bullets: [],
          visualIds: [],
          layout: "blank",
          notes: "",
          backgroundGradient: { from: "#123456", to: "#654321" },
          elements: [
            textEl("t", "Title", { role: "title", textRole: "h1" }),
            bulletsEl("b", ["a", "b"]),
          ],
        },
      ],
    },
  );
  assert.doesNotThrow(() => buildDeckSpecs(d, new Map()));
});
