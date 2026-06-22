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
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
} from "@/lib/presentation/deck";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";
import {
  buildDeckSpecs,
  type DeckBulletsOp,
  type DeckConnectorOp,
  type DeckOp,
  type DeckShapeOp,
  type DeckTextOp,
} from "@/lib/visual/deck-export";

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
    theme: "default",
    elements,
    ...overrides,
  };
}

function deck(elements: SlideElement[], overrides: Partial<Deck> = {}): Deck {
  return {
    theme: "default",
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
      bulletRuns: [[], [{ text: "two", italic: true }]],
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
    bulletsEl("b7", ["legacy text"], {
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
