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
// e2e-governance-allow oversized-test: broad export transform matrix stays together until shared export fixtures are extracted.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type {
  ConnectorElement,
  Deck,
  ImageElement,
  ShapeElement,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
  VisualElement,
} from "@/lib/presentation/deck";
import type { Visual, VisualNode } from "@/lib/visual/schema";
import {
  buildDeckSpecs,
  type DeckBulletsOp,
  type DeckConnectorOp,
  type DeckImageOp,
  type DeckOp,
  type DeckTextOp,
} from "@/lib/presentation/export/deck-export";
import { exportDeckAsSlideImages } from "@/lib/presentation/export/deck-export-slide-images";
import { deckExportTestHelpers } from "@/test/deck-export-helpers";
import {
  buildBulletsElement,
  buildDeck,
  buildConnectorElement,
  buildImageElement,
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
  overrides: Parameters<typeof buildTextElement>[0] = {},
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
  overrides: Parameters<typeof buildBulletsElement>[0] = {},
): TextElement {
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
  overrides: Parameters<typeof buildShapeElement>[0] = {},
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
  overrides: Parameters<typeof buildImageElement>[0] = {},
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

function connectorEl(
  id: string,
  overrides: Parameters<typeof buildConnectorElement>[0] = {},
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

function tableEl(id: string): TableElement {
  return {
    id,
    kind: "table",
    role: "table",
    zIndex: 6,
    box: { x: 10, y: 20, w: 70, h: 40 },
    content: {
      kind: "table",
      header: true,
      caption: "Revenue assumptions",
      columns: [
        { id: "col-1", label: "Region" },
        { id: "col-2", label: "ARR" },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            { text: "NA", runs: [{ text: "NA", bold: true }] },
            { text: "$12M" },
          ],
        },
      ],
    },
    designOverrides: {
      tableStyle: {
        headerFill: { value: "#123456" },
        rowFill: { value: "#f8fafc" },
        alternateRowFill: { value: "#eef2ff" },
        borderColor: "#abcdef",
        borderWidth: 0.2,
        textStyle: { fontSize: 2.2, color: "#111111", align: "left" },
        headerTextStyle: { fontSize: 2.2, color: "#ffffff", bold: true },
      },
    },
  } as unknown as TableElement;
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

const exportGlobals = globalThis as typeof globalThis & {
  DOMParser?: typeof DOMParser;
  FileReader?: typeof FileReader;
  Image?: typeof Image;
  XMLSerializer?: typeof XMLSerializer;
  document?: Document;
  URL: typeof URL;
};
const originalDOMParser = exportGlobals.DOMParser;
const originalFileReader = exportGlobals.FileReader;
const originalImage = exportGlobals.Image;
const originalXMLSerializer = exportGlobals.XMLSerializer;
const originalDocument = exportGlobals.document;
const originalCreateObjectURL = exportGlobals.URL.createObjectURL;
const originalRevokeObjectURL = exportGlobals.URL.revokeObjectURL;

afterEach(() => {
  exportGlobals.DOMParser = originalDOMParser;
  exportGlobals.FileReader = originalFileReader;
  exportGlobals.Image = originalImage;
  exportGlobals.XMLSerializer = originalXMLSerializer;
  exportGlobals.document = originalDocument;
  exportGlobals.URL.createObjectURL = originalCreateObjectURL;
  exportGlobals.URL.revokeObjectURL = originalRevokeObjectURL;
});

function installRasterExportDom(): void {
  const svg = {
    tagName: "svg",
    viewBox: { baseVal: { width: 10, height: 10 } },
  } as unknown as SVGSVGElement;
  exportGlobals.DOMParser = class {
    parseFromString(): { documentElement: SVGSVGElement } {
      return { documentElement: svg };
    }
  } as unknown as typeof DOMParser;
  exportGlobals.XMLSerializer = class {
    serializeToString(): string {
      return '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>';
    }
  } as unknown as typeof XMLSerializer;
  exportGlobals.document = {
    createElement: (tagName: string) => {
      assert.equal(tagName, "canvas");
      return {
        width: 0,
        height: 0,
        getContext: () => ({ scale() {}, drawImage() {} }),
        toBlob: (callback: (blob: Blob) => void) =>
          callback(new Blob(["png"], { type: "image/png" })),
      };
    },
  } as unknown as Document;
  exportGlobals.URL.createObjectURL = () => "blob:textiq";
  exportGlobals.URL.revokeObjectURL = () => {};
  exportGlobals.Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      this.onload?.();
    }
  } as unknown as typeof Image;
  exportGlobals.FileReader = class {
    result: string | null = null;
    onloadend: (() => void) | null = null;

    readAsDataURL(_blob: Blob): void {
      this.result = "data:image/png;base64,ZmFrZQ==";
      this.onloadend?.();
    }
  } as unknown as typeof FileReader;
}

function installSvgSerializer(svgString: string): void {
  exportGlobals.XMLSerializer = class {
    serializeToString(): string {
      return svgString;
    }
  } as unknown as typeof XMLSerializer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("slide count equals deck.slides length, in order", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
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
    schemaVersion: 6,
    canvas: { format: "4:3" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
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
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
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

test("shape ops carry radial fills, glass effects, and radial backgrounds", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(
        0,
        [
          fixtureShapeElement("radial-glass", {
            designOverrides: {
              fill: {
                type: "radialGradient",
                inner: { value: "#ffffff" },
                outer: { value: "#1e293b" },
                cx: 50,
                cy: 45,
                r: 70,
              },
              effect: { kind: "glass", intensity: "strong" },
            },
          }),
        ],
        {
          designOverrides: {
            background: {
              type: "radialGradient",
              inner: { value: "#f8fafc" },
              outer: { value: "#0f172a" },
              cx: 42,
              cy: 38,
              r: 74,
            },
          },
        },
      ),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.deepEqual(spec.backgroundFill, {
    type: "radialGradient",
    inner: "F8FAFC",
    outer: "0F172A",
    cx: 42,
    cy: 38,
    r: 74,
  });
  const shape = ofKind(spec.ops, "shape")[0];
  assert.deepEqual(shape?.fill, {
    type: "radialGradient",
    inner: "FFFFFF",
    outer: "1E293B",
    cx: 50,
    cy: 45,
    r: 70,
  });
  assert.deepEqual(shape?.effect, { kind: "glass", intensity: "strong" });
  assert.equal(shape?.color, "1E293B");
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
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "Themed")], {
        designOverrides: {
          background: { type: "solid", color: { value: "#123456" } },
          accent: { value: "#abcdef" },
        },
      }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  // Colors are normalised to hex-without-# and upper-cased.
  assert.equal(spec.background, "123456");
  assert.equal(spec.accent, "ABCDEF");
});

test("slide without overrides uses the theme background/accent", () => {
  const deck: Deck = buildDeck({
    design: { themeId: "ocean" },
    slides: [freeFormSlide(0, [fixtureTextElement("t", "Theme defaults")])],
  });

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.background, "F6FBFF"); // ocean slideBg (light)
  assert.equal(spec.accent, "0284C7"); // ocean accent (light)
});

test("slide without elements[] is not materialized for export", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    design: { themeId: "indigo" },
    slides: [
      {
        id: "sl-no-elements",
        index: 0,
        title: "Old Title",
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
    design: { themeId: "indigo" },
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
    content: { ...visualEl("ve", "v1").content, styleThemeId: "ocean" },
  };
  const deck: Deck = {
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t1", "Bold Title", {
          runs: [
            { text: "Bold " },
            { text: "Title", bold: true, color: "#ff0000", fontSize: 4 },
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
    { text: "Title", bold: true, color: "#ff0000", fontSize: 22 },
  ]);
});

test("bullets op carries parallel itemRuns when present", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
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

// ---------------------------------------------------------------------------
// ConnectorElement export — new first-class connector kind (issue #323)
// ---------------------------------------------------------------------------

test("connector op inherits custom stroke color and width", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
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

test("connector op with bound endpoints resolves to element anchor positions", () => {
  // Place a target rect at x=50, y=40, w=10, h=10.
  // Its "left" anchor is at (50, 45) and its "right" anchor is at (60, 45).
  const target: ShapeElement = {
    id: "target",
    kind: "shape",
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#aaaaaa" } },
    zIndex: 0,
    box: { x: 50, y: 40, w: 10, h: 10 },
  };
  const connector: ConnectorElement = {
    id: "c5",
    kind: "connector",
    zIndex: 1,
    box: { x: 0, y: 0, w: 100, h: 100 },
    content: {
      kind: "connector",
      start: { elementId: "target", anchor: "left" },
      end: { elementId: "target", anchor: "right" },
    },
  };
  const deck: Deck = {
    design: { themeId: "default" },
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

test("all seven element kinds (including connector and table) each emit at least one op", () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = {
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("t", "Title"),
        bulletsEl("b", ["one"]),
        visualEl("ve", "v1"),
        fixtureShapeElement("sh"),
        imageEl("im"),
        connectorEl("cn"),
        tableEl("tbl"),
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
  assert.ok(
    ofKind(spec.ops, "text").some((op) => op.text === "Revenue assumptions"),
    "table caption text op emitted",
  );
  assert.ok(
    ofKind(spec.ops, "shape").some((op) => op.color === "123456"),
    "table header shape op emitted",
  );
});

test("table export compiles to shape and text ops with rich cell runs", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
    slides: [freeFormSlide(0, [tableEl("tbl")])],
  };
  const [spec] = buildDeckSpecs(deck, new Map());
  const shapes = ofKind(spec.ops, "shape");
  const texts = ofKind(spec.ops, "text");

  assert.ok(shapes.some((op) => op.color === "123456"));
  assert.ok(shapes.some((op) => op.stroke?.color === "ABCDEF"));
  assert.ok(texts.some((op) => op.text === "Region" && op.bold));
  const richCell = texts.find((op) => op.text === "NA");
  assert.ok(richCell?.runs?.[0]?.bold);
  assert.ok(texts.some((op) => op.text === "Revenue assumptions"));
});

test("slide image export writes SVG slides with rich free-form content", async () => {
  const visuals = new Map<string, Visual>([["v1", flowchart()]]);
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(
        0,
        [
          fixtureTextElement("svg-text", "Plain <unsafe> & rich", {
            runs: [
              { text: "Bold's", bold: true, color: "#112233" },
              { text: "\n" },
              { text: "Linked", link: "https://example.test?q=1&ok=true" },
            ],
            rotation: 7,
            opacity: 0.8,
            shadow: true,
            style: {
              fontSize: 5,
              bold: true,
              italic: true,
              underline: true,
              align: "center",
              verticalAlign: "bottom",
              lineHeight: 1.35,
            },
          }),
          bulletsEl("svg-bullets", ["first", "second"], {
            items: [
              { text: "first", listType: "number", indent: 0 },
              {
                text: "second",
                listType: "bullet",
                indent: 1,
                runs: [{ text: "second", code: true }],
              },
            ],
          }),
          fixtureShapeElement("svg-ellipse", {
            shape: "ellipse",
            color: "#abcdef",
            stroke: { color: "#123456", width: 2 },
            rotation: 15,
            shadow: true,
          }),
          fixtureShapeElement("svg-triangle", {
            shape: "triangle",
            color: "#fedcba",
          }),
          fixtureShapeElement("svg-line", {
            shape: "line",
            color: "#101010",
            stroke: { color: "#101010", width: 3 },
          }),
          imageEl("svg-image", {
            src: "https://example.test/a&b.png",
            fitMode: "cover",
            radius: 2,
            opacity: 0.7,
            rotation: 5,
            shadow: true,
          }),
          connectorEl("svg-connector", {
            dash: true,
            arrowStart: "filled",
            arrowEnd: "arrow",
            opacity: 0.5,
          }),
          visualEl("svg-visual", "v1"),
        ],
        {
          designOverrides: {
            background: { type: "image", url: "https://example.test/bg.png" },
          },
        },
      ),
    ],
  });

  const blob = await exportDeckAsSlideImages(deck, visuals, NO_SVG);
  assert.ok(blob, "expected a slide-image ZIP blob");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const svg = await zip.file("slide-01.svg")?.async("string");

  assert.ok(svg, "expected slide-01.svg in the ZIP");
  assert.match(svg, /<foreignObject/);
  assert.match(svg, /Bold&#39;s/);
  assert.match(svg, /text-align:center/);
  assert.match(svg, /line-height:1\.35/);
  assert.match(svg, /https:\/\/example\.test\?q=1&amp;ok=true/);
  assert.match(svg, /marker-start/);
  assert.match(svg, /clipPath/);
  assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(svg, /<ellipse/);
  assert.match(svg, /<polygon/);
  assert.match(svg, /https:\/\/example\.test\/bg\.png/);
});

test("slide image export renders radial glass shapes and triangle image masks", async () => {
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(
        0,
        [
          fixtureShapeElement("glass-triangle", {
            shape: "triangle",
            designOverrides: {
              fill: {
                type: "radialGradient",
                inner: { value: "#ffffff" },
                outer: { value: "#334155" },
                cx: 48,
                cy: 36,
                r: 68,
              },
              effect: { kind: "glass", intensity: "strong" },
            },
          }),
          imageEl("triangle-image", {
            maskShape: "triangle",
            fitMode: "cover",
          }),
        ],
        {
          designOverrides: {
            background: {
              type: "radialGradient",
              inner: { value: "#f8fafc" },
              outer: { value: "#0f172a" },
              cx: 42,
              cy: 38,
              r: 74,
            },
          },
        },
      ),
    ],
  });

  const blob = await exportDeckAsSlideImages(deck, new Map(), NO_SVG);
  assert.ok(blob, "expected a slide-image ZIP blob");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const svg = await zip.file("slide-01.svg")?.async("string");

  assert.ok(svg, "expected slide-01.svg in the ZIP");
  assert.match(svg, /<radialGradient id="slide-0-background-radial-fill"/);
  assert.match(svg, /backdrop-filter:blur\(22px\) saturate\(1\.42\)/);
  assert.match(svg, /clip-path:polygon\(50% 0%, 0% 100%, 100% 100%\)/);
  assert.match(svg, /<clipPath id="slide-0-1-clip"><polygon/);
});

test("slide image export renders native ellipse, diamond, and hexagon visual specs", async () => {
  const shapedVisual = buildVisual({
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [
      buildVisualNode({
        id: "start",
        label: "Start",
        shape: "ellipse",
        x: 100,
        y: 100,
      }),
      buildVisualNode({
        id: "decision",
        label: "Decision",
        shape: "diamond",
        x: 320,
        y: 100,
      }),
      buildVisualNode({
        id: "process",
        label: "Process",
        shape: "hexagon",
        x: 540,
        y: 100,
      }),
    ],
    edges: [],
    style: flowchart().style,
  });
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [freeFormSlide(0, [visualEl("native-shaped-visual", "v1")])],
  });

  const blob = await exportDeckAsSlideImages(
    deck,
    new Map([["v1", shapedVisual]]),
    NO_SVG,
  );
  assert.ok(blob, "expected a slide-image ZIP blob");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const svg = await zip.file("slide-01.svg")?.async("string");

  assert.ok(svg, "expected slide-01.svg in the ZIP");
  assert.match(svg, /<ellipse/);
  assert.ok((svg.match(/<polygon/g) ?? []).length >= 2);
  assert.match(svg, /Decision/);
  assert.match(svg, /font-weight:700/);
  assert.match(svg, /font-family:Calibri/);
});

test("slide image export inlines transformed visual fallback SVGs", async () => {
  installSvgSerializer(
    '<svg viewBox="0 0 200 100"><g id="fallback-inner"><rect width="200" height="100"/></g></svg>',
  );
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [
        {
          ...visualEl("fallback-visual", "v1"),
          rotation: 11,
          opacity: 0.45,
          shadow: true,
        },
      ]),
    ],
  });
  const fallbackSvg = {
    getAttribute: (name: string) => (name === "viewBox" ? "0 0 200 100" : null),
    viewBox: { baseVal: { width: 200, height: 100 } },
  } as unknown as SVGSVGElement;

  const blob = await exportDeckAsSlideImages(
    deck,
    new Map([["v1", flowchart()]]),
    () => fallbackSvg,
  );
  assert.ok(blob, "expected a slide-image ZIP blob");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const svg = await zip.file("slide-01.svg")?.async("string");

  assert.ok(svg, "expected slide-01.svg in the ZIP");
  assert.match(svg, /fallback-inner/);
  assert.match(svg, /rotate\(11/);
  assert.match(svg, /opacity:0\.45/);
  assert.match(svg, /drop-shadow/);
});

test("slide image export falls back to an SVG viewBox from baseVal when no attribute exists", async () => {
  installSvgSerializer('<svg><circle id="fallback-circle" r="5"/></svg>');
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [
        {
          ...visualEl("fallback-with-base-val", "v1"),
          opacity: 0.6,
        },
      ]),
    ],
  });
  const fallbackSvg = {
    getAttribute: () => null,
    viewBox: { baseVal: { width: 320, height: 180 } },
  } as unknown as SVGSVGElement;

  const blob = await exportDeckAsSlideImages(
    deck,
    new Map([["v1", flowchart()]]),
    () => fallbackSvg,
  );
  assert.ok(blob, "expected a slide-image ZIP blob");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const svg = await zip.file("slide-01.svg")?.async("string");

  assert.ok(svg, "expected slide-01.svg in the ZIP");
  assert.match(svg, /viewBox="0 0 320 180"/);
  assert.match(svg, /fallback-circle/);
  assert.match(svg, /opacity:0\.6/);
});

test("shape text is applied to PPTX as a shape plus a text call", async () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
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
    design: { themeId: "indigo" },
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

test("PPTX text applier preserves rich runs and paragraph options", async () => {
  const { slide, textCalls } = recordingSlide();

  deckExportTestHelpers.applyTextOp(slide, {
    kind: "text",
    text: "fallback",
    runs: [
      { text: "Code", code: true, bold: true, color: "#112233" },
      { text: "\n" },
      { text: "Link", link: "https://example.test" },
    ],
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    color: "111111",
    fontSize: 18,
    fontFace: "Inter",
    bold: true,
    italic: true,
    underline: true,
    align: "center",
    verticalAlign: "bottom",
    fitMode: "shrink-to-fit",
    rotation: 12,
    opacity: 0.25,
    lineHeight: 1.4,
    paragraphSpacingPt: 8,
    shadow: true,
  });

  assert.equal(textCalls.length, 1);
  assert.equal(textCalls[0]?.options.valign, "bottom");
  assert.equal(textCalls[0]?.options.shrinkText, true);
  assert.equal(textCalls[0]?.options.transparency, 75);
  assert.equal(textCalls[0]?.options.lineSpacing, 140);
  assert.equal(textCalls[0]?.options.paraSpaceAfter, 8);
  assert.deepEqual(textCalls[0]?.text, [
    {
      text: "Code",
      options: { bold: true, fontFace: "Courier New", color: "112233" },
    },
    { text: "", options: { breakLine: true } },
    { text: "Link", options: { hyperlink: { url: "https://example.test" } } },
  ]);
});

test("PPTX bullets applier handles plain and rich numbered items", () => {
  const plain = recordingSlide();
  deckExportTestHelpers.applyBulletsOp(plain.slide, {
    kind: "bullets",
    items: ["one", "two"],
    itemDetails: [
      { listType: "bullet", indent: 0 },
      { listType: "number", indent: 1 },
    ],
    x: 0,
    y: 0,
    w: 4,
    h: 2,
    color: "111111",
    fontSize: 12,
    bold: false,
    italic: false,
    align: "left",
    verticalAlign: "top",
  });
  assert.equal(plain.textCalls[0]?.options.valign, "top");
  assert.deepEqual((plain.textCalls[0]?.text as any[])[0].options.bullet, true);
  assert.deepEqual((plain.textCalls[0]?.text as any[])[1].options.bullet, {
    type: "number",
  });

  const rich = recordingSlide();
  deckExportTestHelpers.applyBulletsOp(rich.slide, {
    kind: "bullets",
    items: ["one", "two", "three"],
    itemRuns: [
      [{ text: "one", italic: true }],
      [{ text: "\n" }],
      [{ text: "three" }],
    ],
    itemDetails: [{ listType: "bullet", indent: 0 }],
    x: 0,
    y: 0,
    w: 4,
    h: 2,
    color: "111111",
    fontSize: 12,
    bold: false,
    italic: false,
    align: "left",
    verticalAlign: "middle",
    rotation: 3,
    opacity: 0.5,
    shadow: true,
    fitMode: "shrink-to-fit",
    lineHeight: 1.1,
  });
  assert.equal(rich.textCalls[0]?.options.rotate, 3);
  assert.equal(rich.textCalls[0]?.options.transparency, 50);
  assert.equal((rich.textCalls[0]?.text as any[])[0].options.italic, true);
  assert.equal((rich.textCalls[0]?.text as any[])[1].options.breakLine, true);
  assert.equal((rich.textCalls[0]?.text as any[])[1].text, "");
});

test("PPTX shape applier covers line, triangle, diamond, circle, square, ellipse, and rounded rectangle variants", () => {
  const { slide, shapeCalls, textCalls } = recordingSlide();

  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "line",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "111111",
    stroke: { color: "222222", width: 2, dash: true },
    opacity: 0.5,
  });
  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "triangle",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "333333",
    opacity: 0.25,
    shadow: true,
  });
  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "diamond",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "333333",
  });
  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "circle",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "333333",
  });
  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "square",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "333333",
  });
  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "ellipse",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "444444",
  });
  deckExportTestHelpers.applyShapeOp(slide, {
    kind: "shape",
    shape: "rect",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    color: "555555",
    radius: 0.2,
    text: "Rounded",
    textRuns: [{ text: "Rounded", underline: true }],
    textColor: "ffffff",
    fontFace: "Inter",
    fontSize: 10,
    underline: true,
    align: "right",
    rotation: 8,
    opacity: 0.8,
  });

  assert.deepEqual(
    shapeCalls.map((call) => call.shape),
    ["line", "triangle", "diamond", "ellipse", "rect", "ellipse", "roundRect"],
  );
  assert.equal(shapeCalls[0]?.options.line?.dashType, "dash");
  assert.equal(shapeCalls[1]?.options.fill?.transparency, 75);
  assert.equal(shapeCalls[3]?.options.w, 1);
  assert.equal(shapeCalls[3]?.options.h, 1);
  assert.equal(shapeCalls[4]?.options.w, 1);
  assert.equal(shapeCalls[4]?.options.h, 1);
  assert.equal(shapeCalls[6]?.options.rectRadius, 0.2);
  assert.equal(textCalls.length, 1);
});

test("PPTX image and connector appliers handle fallbacks and skipped zero-length lines", async () => {
  const { slide, imageCalls, shapeCalls } = recordingSlide();

  await deckExportTestHelpers.applyImageOp(slide, {
    kind: "image",
    src: "https://example.test/image.png",
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    alt: "remote image",
    fitMode: "cover",
    rotation: 4,
    shadow: true,
    opacity: 0.6,
  });
  await deckExportTestHelpers.applyImageOp(slide, {
    kind: "image",
    src: "data:image/png;base64,AAAA",
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    fitMode: "none",
  });
  deckExportTestHelpers.applyConnectorOp(slide, {
    kind: "connector",
    x1: 1,
    y1: 1,
    x2: 1,
    y2: 1,
    color: "111111",
    width: 1,
  });

  assert.equal(imageCalls.length, 2);
  assert.equal(imageCalls[0]?.path, "https://example.test/image.png");
  assert.deepEqual(imageCalls[0]?.sizing, { type: "cover", w: 3, h: 4 });
  assert.equal(imageCalls[0]?.transparency, 40);
  assert.equal(imageCalls[1]?.data, "data:image/png;base64,AAAA");
  assert.equal(shapeCalls.length, 0, "zero-length connector should be skipped");
});

test("PPTX image applier rasterizes masked and cropped images when browser APIs are available", async () => {
  installRasterExportDom();
  const { slide, imageCalls } = recordingSlide();

  await deckExportTestHelpers.applyImageOp(slide, {
    kind: "image",
    src: "https://example.test/crop.png?x=1&y=2",
    x: 1,
    y: 2,
    w: 3,
    h: 2,
    alt: "cropped",
    fitMode: "cover",
    maskShape: "rounded",
    radius: 0.1,
    crop: { top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 },
    rotation: 9,
    shadow: true,
  });

  assert.equal(imageCalls.length, 1);
  assert.equal(imageCalls[0]?.data, "data:image/png;base64,ZmFrZQ==");
  assert.equal(imageCalls[0]?.altText, "cropped");
  assert.equal(imageCalls[0]?.rotate, 9);
  assert.deepEqual(imageCalls[0]?.shadow, deckExportTestHelpers.SHADOW_OPTS);
});

test("PPTX deck op rasterizes radial glass shapes when browser APIs are available", async () => {
  installRasterExportDom();
  const { slide, imageCalls, shapeCalls } = recordingSlide();

  await deckExportTestHelpers.applyDeckOp(
    slide,
    {
      kind: "shape",
      shape: "triangle",
      x: 1,
      y: 2,
      w: 3,
      h: 2,
      color: "334155",
      fill: {
        type: "radialGradient",
        inner: "FFFFFF",
        outer: "334155",
        cx: 48,
        cy: 36,
        r: 68,
      },
      effect: { kind: "glass", intensity: "strong" },
      text: "Glass",
      rotation: 11,
      shadow: true,
    },
    NO_SVG,
  );

  assert.equal(shapeCalls.length, 0);
  assert.equal(imageCalls.length, 1);
  assert.equal(imageCalls[0]?.data, "data:image/png;base64,ZmFrZQ==");
  assert.equal(imageCalls[0]?.rotate, 11);
  assert.deepEqual(imageCalls[0]?.shadow, deckExportTestHelpers.SHADOW_OPTS);
});

test("PPTX image applier falls back when styled image SVG parsing fails", async () => {
  const originalDOMParser = exportGlobals.DOMParser;
  exportGlobals.DOMParser = class {
    parseFromString(): { documentElement: { tagName: string } } {
      return { documentElement: { tagName: "parsererror" } };
    }
  } as unknown as typeof DOMParser;
  const { slide, imageCalls } = recordingSlide();

  await deckExportTestHelpers.applyImageOp(slide, {
    kind: "image",
    src: "https://example.test/masked.png",
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    alt: "masked",
    fitMode: "cover",
    maskShape: "circle",
  });

  exportGlobals.DOMParser = originalDOMParser;
  assert.equal(imageCalls.length, 1);
  assert.equal(imageCalls[0]?.path, "https://example.test/masked.png");
  assert.equal(imageCalls[0]?.altText, "masked");
  assert.deepEqual(imageCalls[0]?.sizing, { type: "cover", w: 3, h: 4 });
});

// ---------------------------------------------------------------------------
// Multi-level bullets / numbered lists (#335)
// ---------------------------------------------------------------------------

test("bullets op carries both itemRuns and itemDetails for rich numbered/indented items", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
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

test("a hidden image and a hidden shape both produce no ops", () => {
  const deck: Deck = {
    design: { themeId: "default" },
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

test("a locked shape exports with full geometry (lock is editor-only)", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [freeFormSlide(0, [fixtureShapeElement("sh", { locked: true })])],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(ofKind(spec.ops, "shape").length, 1, "locked shape produces op");
});

test("grouped shapes export in z-order and preserve geometry", () => {
  const deck: Deck = {
    design: { themeId: "default" },
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

test("backgroundGradient takes precedence over explicit background color", () => {
  // The cascade resolves gradient backgrounds to their 'from' stop for the
  // PPTX solid background color.
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      freeFormSlide(0, [fixtureTextElement("t", "Both")], {
        designOverrides: {
          background: {
            type: "gradient",
            from: { value: "#334455" },
            to: { value: "#aabbcc" },
          },
        },
      }),
    ],
  };

  const [spec] = buildDeckSpecs(deck, new Map());
  assert.equal(spec.background, "334455");
});

test("slide without any background override uses the theme default", () => {
  const deck: Deck = {
    design: { themeId: "indigo" },
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

test("image element with sourceRef still emits a normal image op", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      freeFormSlide(0, [
        imageEl("im-linked", {
          source: {
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

test("exported text inherits the presentation theme role font when no element override (#606)", () => {
  // indigo themeId: heading font "Space Grotesk", body font "Inter".
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("title", "Heading", {
          role: "title",
        }),
        bulletsEl("b", ["point"]),
      ]),
    ],
  });
  const [spec] = buildDeckSpecs(deck, new Map());
  const title = ofKind(spec.ops, "text")[0] as DeckTextOp;
  const bullets = ofKind(spec.ops, "bullets")[0] as DeckBulletsOp;
  assert.equal(title.fontFace, "Aptos Display");
  assert.equal(bullets.fontFace, "Aptos");
});

test("an explicit element fontId still wins over the role font (#606)", () => {
  const deck: Deck = buildDeck({
    design: { themeId: "indigo" },
    slides: [
      freeFormSlide(0, [
        fixtureTextElement("title", "Heading", {
          role: "title",
          style: {
            fontSize: 6,
            bold: true,
            italic: false,
            align: "left",
            fontId: "jetbrains-mono",
          },
        }),
      ]),
    ],
  });
  const [spec] = buildDeckSpecs(deck, new Map());
  const title = ofKind(spec.ops, "text")[0] as DeckTextOp;
  assert.equal(title.fontFace, "Consolas");
});

// ---------------------------------------------------------------------------
// Non-text template defaults in export (#607)
// ---------------------------------------------------------------------------

function brandDeckWith(
  elements: SlideElement[],
  tokenExtras: Record<string, unknown>,
): Deck {
  return buildDeck({
    design: {
      themeId: "default",
      themeOverrides: {
        tokenSet: {
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
            scale: {
              h1: 36,
              h2: 28,
              h3: 22,
              body: 16,
              list: 14,
              footer: 10,
            },
          },
          spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
          shape: { cornerRadiusPt: 4, shadowCss: "none" },
          defaultBackground: { type: "solid", color: "#ffffff" },
          ...tokenExtras,
        },
      },
    },
    slides: [freeFormSlide(0, elements)],
  });
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
