/**
 * Unit tests for the pure `buildDeckSpecs` transform in deck-export.ts.
 *
 * These assert that the edited deck (`deckJson`) is honored when assembling a
 * PPTX deck:
 *  - one slide spec per `deck.slides` entry, in order;
 *  - edited titles and bullet text survive into the emitted text/bullets ops;
 *  - visuals are embedded (native shapes for natively-supported kinds);
 *  - all five free-form element kinds emit at least one op;
 *  - per-slide `background` / `accent` overrides are applied.
 *
 * No PptxGenJS binary or DOM is required — `buildDeckSpecs` is pure.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BulletsElement,
  ConnectorElement,
  Deck,
  ImageElement,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  VisualElement,
} from "@/lib/presentation/deck";
import type { Visual, VisualNode } from "@/lib/visual/schema";
import {
  buildDeckSpecs,
  type DeckBulletsOp,
  type DeckConnectorOp,
  type DeckOp,
  type DeckTextOp,
} from "@/lib/visual/deck-export";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function node(id: string, label: string, x: number, y: number): VisualNode {
  return { id, label, x, y, width: 150, height: 56 };
}

function flowchart(): Visual {
  return {
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [node("a", "Alpha", 100, 100), node("b", "Beta", 100, 300)],
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

function textEl(
  id: string,
  text: string,
  overrides: Partial<TextElement> = {},
): TextElement {
  return {
    id,
    kind: "text",
    role: "title",
    text,
    zIndex: 0,
    box: { x: 6, y: 6, w: 88, h: 16 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
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
    zIndex: 1,
    box: { x: 6, y: 26, w: 88, h: 66 },
    style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
    ...overrides,
  };
}

function visualEl(id: string, visualId: string): VisualElement {
  return {
    id,
    kind: "visual",
    visualId,
    zIndex: 2,
    box: { x: 54, y: 26, w: 40, h: 66 },
  };
}

function shapeEl(id: string): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#ff8800",
    zIndex: 3,
    box: { x: 2, y: 2, w: 20, h: 10 },
  };
}

function imageEl(id: string): ImageElement {
  return {
    id,
    kind: "image",
    src: "data:image/png;base64,AAAA",
    alt: "pic",
    zIndex: 4,
    box: { x: 70, y: 2, w: 25, h: 20 },
  };
}

function connectorEl(
  id: string,
  overrides: Partial<ConnectorElement> = {},
): ConnectorElement {
  return {
    id,
    kind: "connector",
    zIndex: 5,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { x: 10, y: 20 },
    end: { x: 80, y: 70 },
    ...overrides,
  };
}

function freeFormSlide(
  index: number,
  elements: SlideElement[],
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id: "test-id",
    index,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme: "indigo",
    elements,
    ...overrides,
  };
}

function legacySlide(
  index: number,
  title: string,
  bullets: string[],
  visualIds: string[] = [],
): Slide {
  return {
    id: "test-id",
    index,
    title,
    bullets,
    visualIds,
    layout: visualIds.length > 0 ? "content" : "content",
    notes: "",
    theme: "indigo",
  };
}

function ofKind<K extends DeckOp["kind"]>(
  ops: DeckOp[],
  kind: K,
): Extract<DeckOp, { kind: K }>[] {
  return ops.filter((o): o is Extract<DeckOp, { kind: K }> => o.kind === kind);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("slide count equals deck.slides length, in order", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [textEl("t0", "First")]),
      freeFormSlide(1, [textEl("t1", "Second")]),
      freeFormSlide(2, [textEl("t2", "Third")]),
    ],
  };

  const specs = buildDeckSpecs(deck, new Map());
  assert.equal(specs.length, 3);
  assert.deepEqual(
    specs.map((s) => s.index),
    [0, 1, 2],
  );

  // Order is preserved: the title text on each slide matches the source order.
  const titles = specs.map(
    (s) => (ofKind(s.ops, "text")[0] as DeckTextOp).text,
  );
  assert.deepEqual(titles, ["First", "Second", "Third"]);
});

test("edited title and bullet text are present in the ops", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        textEl("t", "Edited Title"),
        bulletsEl("b", ["Edited bullet one", "Edited bullet two"]),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.text, "Edited Title");

  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(bullets.items, ["Edited bullet one", "Edited bullet two"]);
});

test("4:3 decks convert percentage boxes against the standard 4:3 slide size", () => {
  const deck: Deck = {
    theme: "indigo",
    slideFormat: "4:3",
    slides: [
      freeFormSlide(0, [
        textEl("t", "Standard", {
          box: { x: 50, y: 10, w: 50, h: 20 },
          style: { fontSize: 10, bold: true, italic: false, align: "left" },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.x, 5);
  assert.equal(text.y, 0.75);
  assert.equal(text.w, 5);
  assert.equal(text.h, 1.5);
  assert.equal(text.fontSize, 54);
});

test("a native visual is embedded as native shapes (not a fallback)", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [visualEl("ve", "v1")])],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  const native = ofKind(spec.ops, "visual-native");
  assert.equal(native.length, 1, "exactly one native-visual op");
  assert.ok(native[0].specs.length > 0, "native specs were generated");
  assert.equal(ofKind(spec.ops, "visual-fallback").length, 0);
});

test("a funnel visual falls back to a rasterised image op", () => {
  const funnel: Visual = {
    version: 1,
    type: "funnel",
    width: 600,
    height: 400,
    nodes: [node("a", "Top", 0, 0)],
    edges: [],
    style: flowchart().style,
  };
  const visuals = new Map<string, Visual>([["v1", funnel]]);
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [visualEl("ve", "v1")])],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  const fallback = ofKind(spec.ops, "visual-fallback");
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].visualId, "v1");
});

test("all five element kinds each emit at least one op", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        textEl("t", "Title"),
        bulletsEl("b", ["one"]),
        visualEl("ve", "v1"),
        shapeEl("sh"),
        imageEl("im"),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  assert.ok(ofKind(spec.ops, "text").length >= 1, "text op emitted");
  assert.ok(ofKind(spec.ops, "bullets").length >= 1, "bullets op emitted");
  assert.ok(
    ofKind(spec.ops, "visual-native").length +
      ofKind(spec.ops, "visual-fallback").length >=
      1,
    "visual op emitted",
  );
  assert.ok(ofKind(spec.ops, "shape").length >= 1, "shape op emitted");
  assert.ok(ofKind(spec.ops, "image").length >= 1, "image op emitted");
});

test("an image element with an empty src emits no image op (skips broken image)", () => {
  const empty: ImageElement = {
    id: "im-empty",
    kind: "image",
    src: "",
    zIndex: 1,
    box: { x: 10, y: 10, w: 30, h: 30 },
  };
  const deck: Deck = {
    theme: "default",
    slides: [freeFormSlide(0, [empty])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(
    ofKind(spec.ops, "image").length,
    0,
    "empty-src image must not emit an image op",
  );
});

test("a whitespace-only image src is treated as empty and skipped", () => {
  const blank: ImageElement = {
    id: "im-blank",
    kind: "image",
    src: "   ",
    zIndex: 1,
    box: { x: 10, y: 10, w: 30, h: 30 },
  };
  const deck: Deck = {
    theme: "default",
    slides: [freeFormSlide(0, [blank])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(ofKind(spec.ops, "image").length, 0);
});

test("a visual element whose id is not in the visuals map emits no op", () => {
  // The pure-level analogue of "an unknown visualId renders null safely": the
  // editor/renderer draws null for an orphaned reference, and the exporter
  // likewise skips it rather than emitting a broken native/fallback op.
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [visualEl("v", "missing-visual")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(ofKind(spec.ops, "visual-native").length, 0);
  assert.equal(ofKind(spec.ops, "visual-fallback").length, 0);
  assert.equal(spec.ops.length, 0);
});

test("a known visual survives alongside an unknown one (only the orphan drops)", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        visualEl("v-ok", "vis-known"),
        { ...visualEl("v-bad", "vis-missing"), zIndex: 3 },
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map([["vis-known", flowchart()]]));
  const visualOps =
    ofKind(spec.ops, "visual-native").length +
    ofKind(spec.ops, "visual-fallback").length;
  assert.equal(visualOps, 1, "only the resolvable visual emits an op");
});

test("per-slide background and accent overrides are applied", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [textEl("t", "Themed")], {
        background: "#123456",
        accent: "#abcdef",
      }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  // Colors are normalised to hex-without-# and upper-cased.
  assert.equal(spec.background, "123456");
  assert.equal(spec.accent, "ABCDEF");
});

test("slide without overrides uses the theme background/accent", () => {
  const deck: Deck = {
    theme: "ocean",
    slides: [
      freeFormSlide(0, [textEl("t", "Theme defaults")], { theme: "ocean" }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.background, "0C1A2E"); // ocean bg
  assert.equal(spec.accent, "38BDF8"); // ocean accent
});

test("legacy slide (no elements[]) emits title + bullets + visual", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    theme: "indigo",
    slides: [legacySlide(0, "Legacy Title", ["alpha", "beta"], ["v1"])],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.text, "Legacy Title");

  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(bullets.items, ["alpha", "beta"]);

  assert.ok(
    ofKind(spec.ops, "visual-native").length >= 1,
    "legacy visual is embedded",
  );
});

test("text/bullets boxes convert percentages to inches within slide bounds", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        textEl("t", "Bounded", { box: { x: 0, y: 0, w: 100, h: 50 } }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.x, 0);
  assert.equal(text.y, 0);
  // 100% width → full LAYOUT_WIDE width (13.333"); 50% height → 3.75"
  assert.ok(Math.abs(text.w - 13.333) < 1e-6, "full width in inches");
  assert.ok(Math.abs(text.h - 3.75) < 1e-6, "half height in inches");
});

test("a visual with styleThemeId is restyled before mapping to native specs", () => {
  // The indigo flowchart fixture has nodeFill "#eef2ff" (→ "EEF2FF"). Applying
  // the "ocean" theme restyles nodeFill to "#e0f2fe" (→ "E0F2FE"). The export
  // must mirror the shared renderer's per-element restyle, so the native specs
  // should reflect the ocean color, not the original indigo one.
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const restyled: VisualElement = {
    ...visualEl("ve", "v1"),
    styleThemeId: "ocean",
  };
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [restyled])],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  const native = ofKind(spec.ops, "visual-native");
  assert.equal(native.length, 1, "exactly one native-visual op");
  const json = JSON.stringify(native[0].specs);
  assert.ok(json.includes("E0F2FE"), "ocean nodeFill is present after restyle");
  assert.ok(
    !json.includes("EEF2FF"),
    "original indigo nodeFill is gone after restyle",
  );
});

test("a visual without styleThemeId is mapped unchanged", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [visualEl("ve", "v1")])],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  const native = ofKind(spec.ops, "visual-native");
  assert.equal(native.length, 1, "exactly one native-visual op");
  const json = JSON.stringify(native[0].specs);
  assert.ok(
    json.includes("EEF2FF"),
    "original indigo nodeFill is preserved with no restyle",
  );
  assert.ok(!json.includes("E0F2FE"), "no ocean restyle leaked in");
});

// ---------------------------------------------------------------------------
// Rich-text runs (issue #210)
// ---------------------------------------------------------------------------

test("text op carries runs when the element has them", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        textEl("t1", "Bold Title", {
          runs: [
            { text: "Bold " },
            { text: "Title", bold: true, color: "#ff0000" },
          ],
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.text, "Bold Title");
  assert.deepEqual(text.runs, [
    { text: "Bold " },
    { text: "Title", bold: true, color: "#ff0000" },
  ]);
});

test("text op omits runs when the element has none (plain fallback)", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [textEl("t1", "Plain")])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.text, "Plain");
  assert.equal(text.runs, undefined);
});

test("bullets op carries parallel itemRuns when present", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b1", ["one", "two"], {
          bulletRuns: [[], [{ text: "two", italic: true }]],
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(bullets.items, ["one", "two"]);
  assert.deepEqual(bullets.itemRuns, [[], [{ text: "two", italic: true }]]);
});

test("bullets op omits itemRuns when absent", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [bulletsEl("b1", ["one", "two"])])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.equal(bullets.itemRuns, undefined);
});

// ---------------------------------------------------------------------------
// ConnectorElement export — new first-class connector kind (issue #323)
// ---------------------------------------------------------------------------

test("a connector element emits a connector op with inch-space endpoints", () => {
  // 10% of 13.333" = 1.3333", 20% of 7.5" = 1.5"
  // 80% of 13.333" = 10.6667", 70% of 7.5" = 5.25"
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [connectorEl("c1")])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const ops = ofKind(spec.ops, "connector");
  assert.equal(ops.length, 1, "one connector op emitted");
  const op = ops[0] as DeckConnectorOp;
  assert.ok(Math.abs(op.x1 - 1.333) < 0.01, "x1 ≈ 10% of slide width");
  assert.ok(Math.abs(op.y1 - 1.5) < 0.01, "y1 ≈ 20% of slide height");
  assert.ok(Math.abs(op.x2 - 10.666) < 0.01, "x2 ≈ 80% of slide width");
  assert.ok(Math.abs(op.y2 - 5.25) < 0.01, "y2 ≈ 70% of slide height");
});

test("connector op color defaults to #a1a1aa when no stroke is set", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [freeFormSlide(0, [connectorEl("c2")])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  assert.equal(op.color, "A1A1AA");
});

test("connector op inherits custom stroke color and width", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        connectorEl("c3", { stroke: { color: "#ff0000", width: 2 } }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  assert.equal(op.color, "FF0000");
  assert.ok(op.width > 0, "stroke width is positive");
});

test("connector op carries arrowEnd and dash when set", () => {
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        connectorEl("c4", {
          arrowEnd: "filled",
          dash: true,
          arrowStart: "none",
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  assert.equal(op.arrowEnd, "filled");
  assert.equal(op.arrowStart, "none");
  assert.equal(op.dash, true);
});

test("connector op with bound endpoints resolves to element anchor positions", () => {
  // Place a target rect at x=50, y=40, w=10, h=10.
  // Its "left" anchor is at (50, 45) and its "right" anchor is at (60, 45).
  const target: ShapeElement = {
    id: "target",
    kind: "shape",
    shape: "rect",
    color: "#aaaaaa",
    zIndex: 0,
    box: { x: 50, y: 40, w: 10, h: 10 },
  };
  const connector: ConnectorElement = {
    id: "c5",
    kind: "connector",
    zIndex: 1,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { elementId: "target", anchor: "left" },
    end: { elementId: "target", anchor: "right" },
  };
  const deck: Deck = {
    theme: "default",
    slides: [freeFormSlide(0, [target, connector])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  // left anchor of target: x=50% → 50/100*13.333 ≈ 6.666", y=45% → 45/100*7.5 = 3.375"
  assert.ok(Math.abs(op.x1 - 6.666) < 0.01, "x1 resolves to left anchor");
  assert.ok(Math.abs(op.y1 - 3.375) < 0.01, "y1 resolves to anchor midpoint");
  // right anchor: x=60% → 7.999", y=45% → 3.375"
  assert.ok(Math.abs(op.x2 - 7.999) < 0.01, "x2 resolves to right anchor");
  assert.ok(Math.abs(op.y2 - 3.375) < 0.01, "y2 resolves to anchor midpoint");
});

test("all six element kinds (including connector) each emit at least one op", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    theme: "indigo",
    slides: [
      freeFormSlide(0, [
        textEl("t", "Title"),
        bulletsEl("b", ["one"]),
        visualEl("ve", "v1"),
        shapeEl("sh"),
        imageEl("im"),
        connectorEl("cn"),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, visuals);
  assert.ok(ofKind(spec.ops, "text").length >= 1, "text op emitted");
  assert.ok(ofKind(spec.ops, "bullets").length >= 1, "bullets op emitted");
  assert.ok(
    ofKind(spec.ops, "visual-native").length +
      ofKind(spec.ops, "visual-fallback").length >=
      1,
    "visual op emitted",
  );
  assert.ok(ofKind(spec.ops, "shape").length >= 1, "shape op emitted");
  assert.ok(ofKind(spec.ops, "image").length >= 1, "image op emitted");
  assert.ok(ofKind(spec.ops, "connector").length >= 1, "connector op emitted");
});

// Backward-compatibility: legacy line shapes still export correctly (#323).
test("legacy line shape with connector binding still emits a shape op", () => {
  const lineShape: ShapeElement = {
    id: "line1",
    kind: "shape",
    shape: "line",
    color: "#888888",
    zIndex: 0,
    box: { x: 10, y: 50, w: 80, h: 1 },
    connector: {
      start: undefined,
      end: undefined,
    },
  };
  const deck: Deck = {
    theme: "default",
    slides: [freeFormSlide(0, [lineShape])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  assert.ok(
    ofKind(spec.ops, "shape").length >= 1,
    "legacy line shape still emits",
  );
});
