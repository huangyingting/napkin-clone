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

function freeFormSlide(
  index: number,
  elements: SlideElement[],
  overrides: Partial<Slide> = {},
): Slide {
  return {
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
