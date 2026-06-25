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
  PlaceholderElement,
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
  deckExportTestHelpers,
  type DeckImageOp,
  type DeckOp,
  type DeckTextOp,
} from "@/lib/visual/deck-export";
import {
  buildBulletsElement,
  buildConnectorElement,
  buildImageElement,
  buildPlaceholderElement,
  buildShapeElement,
  buildSlide,
  buildTextElement,
  buildVisualElement,
} from "@/test/builders/deck";
import {
  buildVisual,
  buildVisualEdge,
  buildVisualNode,
} from "@/test/builders/visual";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function node(id: string, label: string, x: number, y: number): VisualNode {
  return buildVisualNode({ id, label, x, y, width: 150, height: 56 });
}

function flowchart(): Visual {
  return buildVisual({
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [node("a", "Alpha", 100, 100), node("b", "Beta", 100, 300)],
    edges: [buildVisualEdge({ id: "e1", from: "a", to: "b" })],
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
  });
}

function fixtureTextElement(
  id: string,
  text: string,
  overrides: Partial<TextElement> = {},
): TextElement {
  return buildTextElement({
    id,
    role: "title",
    text,
    zIndex: 0,
    box: { x: 6, y: 6, w: 88, h: 16 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
    ...overrides,
  });
}

function bulletsEl(
  id: string,
  bullets: string[],
  overrides: Partial<BulletsElement> = {},
): BulletsElement {
  return buildBulletsElement({
    id,
    bullets,
    items: bullets.map((text) => ({ text })),
    zIndex: 1,
    box: { x: 6, y: 26, w: 88, h: 66 },
    style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
    ...overrides,
  });
}

function visualEl(id: string, visualId: string): VisualElement {
  return buildVisualElement({
    id,
    visualId,
    zIndex: 2,
    box: { x: 54, y: 26, w: 40, h: 66 },
  });
}

function fixtureShapeElement(
  id: string,
  overrides: Partial<ShapeElement> = {},
): ShapeElement {
  return buildShapeElement({
    id,
    shape: "rect",
    color: "#ff8800",
    zIndex: 3,
    box: { x: 2, y: 2, w: 20, h: 10 },
    ...overrides,
  });
}

function imageEl(
  id: string,
  overrides: Partial<ImageElement> = {},
): ImageElement {
  return buildImageElement({
    id,
    src: "data:image/png;base64,AAAA",
    alt: "pic",
    zIndex: 4,
    box: { x: 70, y: 2, w: 25, h: 20 },
    ...overrides,
  });
}

function placeholderEl(
  id: string,
  overrides: Partial<PlaceholderElement> = {},
): PlaceholderElement {
  return buildPlaceholderElement({
    id,
    placeholderType: "body",
    zIndex: 2,
    box: { x: 20, y: 20, w: 30, h: 20 },
    ...overrides,
  });
}

function connectorEl(
  id: string,
  overrides: Partial<ConnectorElement> = {},
): ConnectorElement {
  return buildConnectorElement({
    id,
    zIndex: 5,
    box: { x: 0, y: 0, w: 100, h: 100 },
    start: { x: 10, y: 20 },
    end: { x: 80, y: 70 },
    ...overrides,
  });
}

function freeFormSlide(
  index: number,
  elements: SlideElement[],
  overrides: Partial<Slide> = {},
): Slide {
  return buildSlide({
    id: "test-id",
    index,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements,
    ...overrides,
  });
}

function ofKind<K extends DeckOp["kind"]>(
  ops: DeckOp[],
  kind: K,
): Extract<DeckOp, { kind: K }>[] {
  return ops.filter((o): o is Extract<DeckOp, { kind: K }> => o.kind === kind);
}

interface RecordedTextCall {
  text: unknown;
  options: {
    rotate?: number;
    transparency?: number;
    [key: string]: unknown;
  };
}

interface RecordedShapeCall {
  shape: unknown;
  options: {
    rotate?: number;
    shadow?: unknown;
    fill?: { color?: string; transparency?: number };
    line?: {
      dashType?: string;
      endArrowType?: string;
      transparency?: number;
    };
    [key: string]: unknown;
  };
}

function recordingSlide() {
  const textCalls: RecordedTextCall[] = [];
  const shapeCalls: RecordedShapeCall[] = [];
  const imageCalls: Array<Record<string, unknown>> = [];

  const slide = {
    addText(text: unknown, options: RecordedTextCall["options"]) {
      textCalls.push({ text, options });
    },
    addShape(shape: unknown, options: RecordedShapeCall["options"]) {
      shapeCalls.push({ shape, options });
    },
    addImage(options: Record<string, unknown>) {
      imageCalls.push(options);
    },
  } as unknown as Parameters<typeof deckExportTestHelpers.applyDeckOp>[0];

  return { slide, textCalls, shapeCalls, imageCalls };
}

const NO_SVG = () => null;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("slide count equals deck.slides length, in order", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [fixtureTextElement("t0", "First")]),
      freeFormSlide(1, [fixtureTextElement("t1", "Second")]),
      freeFormSlide(2, [fixtureTextElement("t2", "Third")]),
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
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t", "Edited Title"),
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
    themeId: "indigo",
    slideFormat: "4:3",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t", "Standard", {
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
    themeId: "indigo",
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
    themeId: "indigo",
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
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t", "Title"),
        bulletsEl("b", ["one"]),
        visualEl("ve", "v1"),
        fixtureShapeElement("sh"),
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

test("image ops carry fitMode, maskShape, and crop metadata", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        imageEl("im", {
          fitMode: "fill",
          maskShape: "diamond",
          crop: { top: 0.1, right: 0.2, bottom: 0.05, left: 0.15 },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const image = ofKind(spec.ops, "image")[0];
  assert.equal(image?.fitMode, "fill");
  assert.equal(image?.maskShape, "diamond");
  assert.deepEqual(image?.crop, {
    top: 0.1,
    right: 0.2,
    bottom: 0.05,
    left: 0.15,
  });
});

test("an image element with fitMode=contain emits op with fitMode=contain", () => {
  // Verifies that `contain` is forwarded so applyImageOp can pass
  // `sizing: { type: "contain" }` to PptxGenJS.
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [imageEl("im-contain", { fitMode: "contain" })])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const image = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(image?.fitMode, "contain");
});

test("an image element with fitMode=cover emits op with fitMode=cover", () => {
  // Verifies that `cover` is forwarded so applyImageOp can pass
  // `sizing: { type: "cover" }` to PptxGenJS.
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [imageEl("im-cover", { fitMode: "cover" })])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const image = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(image?.fitMode, "cover");
});

test("an image element with no fitMode emits op with no fitMode field", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [imageEl("im-plain")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const image = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(image?.fitMode, undefined);
});

test("maskShape is present on op so PDF/image renderers can apply clip (PPTX degrades gracefully)", () => {
  // The PPTX applier does not support shape clipping, but the op must carry
  // maskShape so that future PDF/canvas renderers can act on it.
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [imageEl("im-circle", { maskShape: "circle" })])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const image = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(image?.maskShape, "circle");
});

test("an image element without maskShape emits op with no maskShape field", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [imageEl("im-no-mask")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const image = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(image?.maskShape, undefined);
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
    themeId: "default",
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
    themeId: "default",
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
    themeId: "indigo",
    slides: [freeFormSlide(0, [visualEl("v", "missing-visual")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(ofKind(spec.ops, "visual-native").length, 0);
  assert.equal(ofKind(spec.ops, "visual-fallback").length, 0);
  assert.equal(spec.ops.length, 0);
});

test("a known visual survives alongside an unknown one (only the orphan drops)", () => {
  const deck: Deck = {
    themeId: "indigo",
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

test("a transformed visual degrades to a fallback image op instead of losing styling", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const transformed: VisualElement = {
    ...visualEl("ve", "v1"),
    rotation: 15,
    shadow: true,
    opacity: 0.4,
  };
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [transformed])],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  assert.equal(ofKind(spec.ops, "visual-native").length, 0);
  const fallback = ofKind(spec.ops, "visual-fallback");
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].rotation, 15);
  assert.equal(fallback[0].shadow, true);
  assert.equal(fallback[0].opacity, 0.4);
});

test("per-slide background and accent overrides are applied", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "Themed")], {
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
    themeId: "ocean",
    slides: [freeFormSlide(0, [fixtureTextElement("t", "Theme defaults")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.background, "F6FBFF"); // ocean slideBg (light)
  assert.equal(spec.accent, "0284C7"); // ocean accent (light)
});

test("slide without elements[] is not materialized for export", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      {
        id: "sl-no-elements",
        index: 0,
        title: "Old Title",
        bullets: ["alpha", "beta"],
        visualIds: ["v1"],
        layout: "content",
        notes: "",
      },
    ],
  };

  const [spec] = buildDeckSpecs(deck, visuals);
  assert.equal(ofKind(spec.ops, "text").length, 0);
  assert.equal(ofKind(spec.ops, "bullets").length, 0);
  assert.equal(ofKind(spec.ops, "visual-native").length, 0);
});

test("text/bullets boxes convert percentages to inches within slide bounds", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t", "Bounded", {
          box: { x: 0, y: 0, w: 100, h: 50 },
        }),
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
    themeId: "indigo",
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
    themeId: "indigo",
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
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t1", "Bold Title", {
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
    themeId: "indigo",
    slides: [freeFormSlide(0, [fixtureTextElement("t1", "Plain")])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(text.text, "Plain");
  assert.equal(text.runs, undefined);
});

test("bullets op carries parallel itemRuns when present", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b1", ["one", "two"], {
          items: [
            { text: "one" },
            { text: "two", runs: [{ text: "two", italic: true }] },
          ],
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
    themeId: "indigo",
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
    themeId: "indigo",
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
    themeId: "indigo",
    slides: [freeFormSlide(0, [connectorEl("c2")])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  assert.equal(op.color, "A1A1AA");
});

test("connector op inherits custom stroke color and width", () => {
  const deck: Deck = {
    themeId: "indigo",
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
    themeId: "indigo",
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
    themeId: "default",
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
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t", "Title"),
        bulletsEl("b", ["one"]),
        visualEl("ve", "v1"),
        fixtureShapeElement("sh"),
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

test("shape text is applied to PPTX as a shape plus a text call", async () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureShapeElement("shape-text", {
          text: "Inside",
          rotation: 18,
          shadow: true,
          opacity: 0.25,
          textStyle: {
            fontSize: 4,
            bold: true,
            italic: false,
            align: "center",
          },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "shape")[0];
  const { slide, shapeCalls, textCalls } = recordingSlide();

  await deckExportTestHelpers.applyDeckOp(slide, op, NO_SVG);

  assert.equal(shapeCalls.length, 1, "shape body emitted");
  assert.equal(shapeCalls[0]?.shape, "rect");
  assert.equal(shapeCalls[0]?.options.rotate, 18);
  assert.deepEqual(
    shapeCalls[0]?.options.shadow,
    deckExportTestHelpers.SHADOW_OPTS,
  );
  assert.deepEqual(shapeCalls[0]?.options.fill, {
    color: "FF8800",
    transparency: 75,
  });
  assert.equal(textCalls.length, 1, "shape label emitted");
  assert.equal(textCalls[0]?.text, "Inside");
  assert.equal(textCalls[0]?.options.transparency, 75);
});

test("connector export is applied to PPTX as a line shape", async () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        connectorEl("pptx-connector", {
          dash: true,
          arrowEnd: "filled",
          opacity: 0.4,
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "connector")[0];
  const { slide, shapeCalls } = recordingSlide();

  await deckExportTestHelpers.applyDeckOp(slide, op, NO_SVG);

  assert.equal(shapeCalls.length, 1);
  assert.equal(shapeCalls[0]?.shape, "line");
  assert.equal(shapeCalls[0]?.options.line?.dashType, "dash");
  assert.equal(shapeCalls[0]?.options.line?.endArrowType, "arrow");
  assert.equal(shapeCalls[0]?.options.line?.transparency, 60);
});

test("placeholder elements export as labeled placeholder ops instead of dropping silently", async () => {
  const deck: Deck = {
    themeId: "default",
    slides: [freeFormSlide(0, [placeholderEl("ph1")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const shapes = ofKind(spec.ops, "shape");
  const texts = ofKind(spec.ops, "text");
  assert.equal(shapes.length, 1, "placeholder outline emitted");
  assert.equal(texts.length, 1, "placeholder label emitted");
  assert.equal(texts[0]?.text, "Body");

  const { slide, shapeCalls, textCalls } = recordingSlide();
  await deckExportTestHelpers.applyDeckOp(slide, shapes[0], NO_SVG);
  await deckExportTestHelpers.applyDeckOp(slide, texts[0], NO_SVG);
  assert.equal(shapeCalls.length, 1);
  assert.equal(textCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Multi-level bullets / numbered lists (#335)
// ---------------------------------------------------------------------------

test("bullets op carries itemDetails when items have indent or listType", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b", ["one", "two", "three"], {
          items: [
            { text: "one", indent: 0, listType: "bullet" },
            { text: "two", indent: 1, listType: "number" },
            { text: "three", indent: 2, listType: "bullet" },
          ],
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(op.items, ["one", "two", "three"]);
  assert.ok(op.itemDetails, "itemDetails present");
  assert.equal(op.itemDetails?.[0].indent, 0);
  assert.equal(op.itemDetails?.[1].indent, 1);
  assert.equal(op.itemDetails?.[1].listType, "number");
  assert.equal(op.itemDetails?.[2].indent, 2);
});

test("bullets op omits itemDetails for a flat bullet list", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [bulletsEl("b", ["alpha", "beta"])])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(op.items, ["alpha", "beta"]);
  assert.equal(op.itemDetails, undefined);
});

test("bullets op uses items[] text when element has items field", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b", ["mirrored text"], {
          items: [{ text: "authoritative text", indent: 0 }],
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(op.items, ["authoritative text"]);
});

test("bullets op numbered list carries all items as number listType", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b", ["step 1", "step 2"], {
          items: [
            { text: "step 1", listType: "number" },
            { text: "step 2", listType: "number" },
          ],
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.ok(op.itemDetails, "itemDetails present for numbered list");
  assert.equal(op.itemDetails?.[0].listType, "number");
  assert.equal(op.itemDetails?.[1].listType, "number");
});

test("bullets op carries both itemRuns and itemDetails for rich numbered/indented items", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b", ["top", "nested"], {
          items: [
            { text: "top", indent: 0, listType: "bullet" },
            {
              text: "nested",
              indent: 1,
              listType: "number",
              runs: [{ text: "nested", italic: true }],
            },
          ],
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const op = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.deepEqual(op.items, ["top", "nested"]);
  assert.ok(op.itemRuns, "itemRuns present");
  assert.deepEqual(op.itemRuns?.[1], [{ text: "nested", italic: true }]);
  assert.ok(op.itemDetails, "itemDetails present");
  assert.equal(op.itemDetails?.[0].indent, 0);
  assert.equal(op.itemDetails?.[1].indent, 1);
  assert.equal(op.itemDetails?.[1].listType, "number");
});

// ---------------------------------------------------------------------------
// Hidden / locked / grouped elements (issue #379)
// ---------------------------------------------------------------------------

test("a hidden text element produces no ops", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t-hidden", "ghost", { hidden: true }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.ops.length, 0, "hidden element must not produce any ops");
});

test("a hidden element is dropped while its visible sibling on the same slide is kept", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t-visible", "visible"),
        fixtureTextElement("t-hidden", "hidden", { hidden: true, zIndex: 1 }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const texts = ofKind(spec.ops, "text");
  assert.equal(texts.length, 1, "only the visible text op survives");
  assert.equal(texts[0]?.text, "visible");
});

test("a hidden image and a hidden shape both produce no ops", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        imageEl("im", { hidden: true }),
        fixtureShapeElement("sh", { hidden: true, zIndex: 1 }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.ops.length, 0, "all hidden elements dropped");
});

test("a locked text element exports identically to an unlocked one", () => {
  const unlockedDeck: Deck = {
    themeId: "default",
    slides: [freeFormSlide(0, [fixtureTextElement("t", "hello")])],
  };
  const lockedDeck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "hello", { locked: true })]),
    ],
  };

  const [uSpec] = buildDeckSpecs(unlockedDeck, new Map());
  const [lSpec] = buildDeckSpecs(lockedDeck, new Map());
  const uText = ofKind(uSpec.ops, "text")[0] as DeckTextOp;
  const lText = ofKind(lSpec.ops, "text")[0] as DeckTextOp;

  assert.ok(uText && lText, "both produce text ops");
  assert.equal(lText.text, uText.text);
  assert.equal(lText.x, uText.x);
  assert.equal(lText.w, uText.w);
});

test("a locked shape exports with full geometry (lock is editor-only)", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [freeFormSlide(0, [fixtureShapeElement("sh", { locked: true })])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(ofKind(spec.ops, "shape").length, 1, "locked shape produces op");
});

test("grouped elements each emit their own op (group membership is flattened in export)", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t1", "Group member A", { groupId: "g1" }),
        fixtureTextElement("t2", "Group member B", {
          groupId: "g1",
          zIndex: 1,
        }),
        fixtureTextElement("t3", "No group", { zIndex: 2 }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const texts = ofKind(spec.ops, "text");
  assert.equal(texts.length, 3, "all three elements produce ops");
  assert.deepEqual(
    texts.map((t) => t.text),
    ["Group member A", "Group member B", "No group"],
  );
});

test("grouped shapes export in z-order and preserve geometry", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        fixtureShapeElement("sh1", {
          groupId: "g2",
          box: { x: 5, y: 5, w: 20, h: 15 },
        }),
        fixtureShapeElement("sh2", {
          groupId: "g2",
          zIndex: 1,
          box: { x: 30, y: 5, w: 20, h: 15 },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(
    ofKind(spec.ops, "shape").length,
    2,
    "both grouped shapes export",
  );
});

// ---------------------------------------------------------------------------
// Background gradient and image (issue #379)
// ---------------------------------------------------------------------------

test("backgroundGradient: spec.background uses the 'from' stop color", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "Gradient bg")], {
        backgroundGradient: { from: "#112233", to: "#aabbcc" },
      }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(
    spec.background,
    "112233",
    "gradient from-stop used as PPTX background",
  );
});

test("backgroundGradient takes precedence over explicit background color", () => {
  // The cascade resolves: image > gradient > solid, so when both backgroundGradient
  // and background are set, the gradient wins and its 'from' stop is used as the
  // PPTX solid background color.
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "Both")], {
        background: "#ffffff",
        backgroundGradient: { from: "#334455", to: "#aabbcc" },
      }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.background, "334455");
});

test("backgroundImage is forwarded verbatim to the slide spec", () => {
  const dataUrl = "data:image/jpeg;base64,JFIF";
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "Image bg")], {
        backgroundImage: dataUrl,
      }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(
    spec.backgroundImage,
    dataUrl,
    "backgroundImage verbatim in spec",
  );
});

test("slide without any background override uses the theme default", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [freeFormSlide(0, [fixtureTextElement("t", "Theme bg")])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.ok(
    spec.background.length === 6,
    "background is a 6-char hex string from the theme",
  );
  assert.equal(spec.backgroundImage, undefined, "no backgroundImage in spec");
});

// ---------------------------------------------------------------------------
// sourceRef metadata (issue #379)
// ---------------------------------------------------------------------------

test("text element with an active sourceRef still emits a normal text op", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t-linked", "Source-linked text", {
          sourceRef: {
            documentId: "doc-x",
            blockId: "blk-1",
            contentHash: "deadbeef",
            linkedAt: "2026-01-01T00:00:00Z",
            blockKind: "text",
          },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const text = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.ok(text, "text op emitted");
  assert.equal(text.text, "Source-linked text");
});

test("bullets element with sourceRef still emits a normal bullets op", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        bulletsEl("b-linked", ["alpha", "beta"], {
          sourceRef: {
            documentId: "doc-x",
            blockId: "blk-2",
            linkedAt: "2026-01-01T00:00:00Z",
            blockKind: "text",
          },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.ok(bullets, "bullets op emitted");
  assert.deepEqual(bullets.items, ["alpha", "beta"]);
});

test("image element with sourceRef still emits a normal image op", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        imageEl("im-linked", {
          sourceRef: {
            documentId: "doc-x",
            blockId: "blk-3",
            linkedAt: "2026-01-01T00:00:00Z",
            blockKind: "text",
          },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(
    ofKind(spec.ops, "image").length,
    1,
    "image op emitted with sourceRef",
  );
});

test("element with unlinked=true sourceRef exports normally (unlinked is metadata-only)", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t-unlinked", "Detached", {
          sourceRef: {
            documentId: "doc-x",
            blockId: "blk-4",
            linkedAt: "2026-01-01T00:00:00Z",
            unlinked: true,
            blockKind: "text",
          },
        }),
      ]),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(
    ofKind(spec.ops, "text").length,
    1,
    "unlinked element still exports",
  );
  assert.equal(ofKind(spec.ops, "text")[0]?.text, "Detached");
});

test("exported text inherits the deck-template role font when no element override (#606)", () => {
  // indigo themeId: heading font "Space Grotesk", body font "Inter".
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("title", "Heading", {
          role: "title",
          textRole: "h1",
        }),
        bulletsEl("b", ["point"]),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const title = ofKind(spec.ops, "text")[0] as DeckTextOp;
  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.equal(title.fontFace, "Space Grotesk");
  assert.equal(bullets.fontFace, "Inter");
});

test("an explicit element fontFamily still wins over the role font (#606)", () => {
  const deck: Deck = {
    themeId: "indigo",
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("title", "Heading", {
          role: "title",
          style: {
            fontSize: 6,
            bold: true,
            italic: false,
            align: "left",
            fontFamily: "Courier New, monospace",
          },
        }),
      ]),
    ],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const title = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(title.fontFace, "Courier New");
});

// ---------------------------------------------------------------------------
// Non-text template defaults in export (#607)
// ---------------------------------------------------------------------------

function brandDeckWith(
  elements: SlideElement[],
  tokenExtras: Record<string, unknown>,
): Deck {
  return {
    themeId: "default",
    customTokenSet: {
      id: "brand:nt",
      name: "NT",
      colors: {
        slideBg: "#ffffff",
        surface: "#f0f0f0",
        accent: "#3366ff",
        onBg: "#0f172a",
        onSurface: "#111111",
        onAccent: "#ffffff",
        muted: "#64748b",
      },
      typography: {
        fontFamily: "Inter",
        scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
      },
      spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
      shape: { cornerRadiusPt: 4, shadowCss: "none" },
      defaultBackground: { type: "solid", color: "#ffffff" },
      ...tokenExtras,
    },
    slides: [freeFormSlide(0, elements)],
  } as unknown as Deck;
}

test("export inherits the template image fit mode when the element omits it (#607)", () => {
  const deck = brandDeckWith([imageEl("img")], { image: { fitMode: "cover" } });
  const [spec] = buildDeckSpecs(deck, new Map());
  const img = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(img.fitMode, "cover");
});

test("an element image fit mode overrides the template default (#607)", () => {
  const deck = brandDeckWith([imageEl("img", { fitMode: "fill" })], {
    image: { fitMode: "cover" },
  });
  const [spec] = buildDeckSpecs(deck, new Map());
  const img = ofKind(spec.ops, "image")[0] as DeckImageOp;
  assert.equal(img.fitMode, "fill");
});

test("export inherits template connector color and end arrow (#607)", () => {
  const deck = brandDeckWith([connectorEl("c")], {
    connector: { color: "#00ff00", endArrow: "filled" },
  });
  const [spec] = buildDeckSpecs(deck, new Map());
  const conn = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  assert.equal(conn.color.toLowerCase(), "00ff00");
  assert.equal(conn.arrowEnd, "filled");
});

test("an element connector stroke overrides the template default (#607)", () => {
  const deck = brandDeckWith(
    [connectorEl("c", { stroke: { color: "#ff0000", width: 1 } })],
    { connector: { color: "#00ff00" } },
  );
  const [spec] = buildDeckSpecs(deck, new Map());
  const conn = ofKind(spec.ops, "connector")[0] as DeckConnectorOp;
  assert.equal(conn.color.toLowerCase(), "ff0000");
});
