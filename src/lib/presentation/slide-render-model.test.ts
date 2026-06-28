import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type SlideElement,
} from "./deck";
import type { MasterElement } from "./deck-core";
import { resolveSlideRenderModel } from "./slide-render-model";

function shapeElement(id: string, zIndex: number): SlideElement {
  return {
    id,
    kind: "shape",
    role: "label",
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#123456" } },
  } as unknown as SlideElement;
}

function visualElement(id: string, zIndex: number): SlideElement {
  return {
    id,
    kind: "visual",
    role: "visual",
    box: { x: 0, y: 0, w: 40, h: 40 },
    zIndex,
    content: { kind: "visual", visualId: "visual-1" },
    designOverrides: { styleThemeId: "ocean" },
  } as unknown as SlideElement;
}

function masterTextElement(
  id: string,
  masterChromeKind: "footer" | "watermark",
  zIndex: number,
): MasterElement {
  const text = masterChromeKind === "footer" ? "Footer" : "Watermark";
  return {
    id,
    kind: "text",
    role: masterChromeKind === "footer" ? "footer" : "background",
    masterChromeKind,
    layer: masterChromeKind === "footer" ? "foreground" : "background",
    locked: true,
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "text", text, paragraphs: [{ text }] },
  } as unknown as MasterElement;
}

function deck(): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    defaultMasterId: "master-default",
    masters: [
      {
        id: "master-default",
        name: "Default",
        background: { type: "solid", color: { value: "#eeeeee" } },
        elements: [
          masterTextElement("master-fg", "footer", 2),
          masterTextElement("master-bg", "watermark", 1),
        ],
      },
    ],
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        designOverrides: {
          background: { type: "solid", color: { value: "#ffffff" } },
        },
        elements: [shapeElement("slide-el", 0)],
      },
    ],
  } as unknown as Deck;
}

function textElement(id: string, text: string, zIndex: number): MasterElement {
  return {
    id,
    kind: "text",
    role: "pageNumber",
    masterChromeKind: "pageNumber",
    layer: "foreground",
    locked: true,
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "text", text, paragraphs: [{ text }] },
  } as unknown as MasterElement;
}

test("resolveSlideRenderModel includes master layers around slide elements", () => {
  const d = deck();
  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.master?.id, "master-default");
  assert.deepEqual(model.canvas, {
    format: "16:9",
    width: 16,
    height: 9,
    pptxWidthIn: 13.333,
    pptxHeightIn: 7.5,
  });
  assert.equal(model.background.type, "solid");
  if (model.background.type === "solid") {
    assert.equal(model.background.color, "#ffffff");
  }
  assert.deepEqual(
    model.masterBackgroundElements.map((element) => element.id),
    ["master-bg"],
  );
  assert.deepEqual(
    model.slideElements.map((element) => element.id),
    ["slide-el"],
  );
  assert.deepEqual(
    model.masterForegroundElements.map((element) => element.id),
    ["master-fg"],
  );
  assert.deepEqual(
    model.renderedElements.map((element) => element.id),
    ["master-bg", "slide-el", "master-fg"],
  );
  assert.equal(model.elementDesigns["slide-el"]?.kind, "shape");
  if (model.elementDesigns["slide-el"]?.kind === "shape") {
    assert.equal(model.elementDesigns["slide-el"].fill, "#123456");
  }
});

test("resolveSlideRenderModel renders master chrome placeholders per slide", () => {
  const d = deck();
  d.masters = [
    {
      id: "master-default",
      name: "Default",
      elements: [textElement("page", "{{pageNumber}} / {{pageCount}}", 0)],
    },
  ];
  d.slides = [
    d.slides[0]!,
    { ...d.slides[0]!, id: "slide-2", index: 1, elements: [] },
  ];

  const model = resolveSlideRenderModel(d, d.slides[1]!);
  const page = model.masterForegroundElements.find(
    (element) => element.id === "page",
  );

  assert.equal(page?.kind, "text");
  if (page?.kind === "text") {
    assert.equal(page.content.text, "2 / 2");
    assert.equal(page.content.paragraphs?.[0]?.text, "2 / 2");
  }
});

test("resolveSlideRenderModel applies visual style overrides", () => {
  const d = deck();
  d.slides[0] = {
    ...d.slides[0]!,
    elements: [visualElement("visual-el", 0)],
  };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.elementDesigns["visual-el"]?.kind, "visual");
  if (model.elementDesigns["visual-el"]?.kind === "visual") {
    assert.equal(model.elementDesigns["visual-el"].styleThemeId, "ocean");
  }
});
