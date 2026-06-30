import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, TextElement } from "./deck";
import {
  adaptShapeLabelForExport,
  adaptShapeLabelForRenderer,
  adaptTextElementForExport,
  adaptTextElementForRenderer,
} from "./style-export-normalizers";

const SLIDE_HEIGHT_PT = 540;

function textElement(
  overrides: Partial<TextElement> & {
    designOverrides?: unknown;
    role?: string;
  } = {},
): TextElement {
  return {
    id: "t1",
    kind: "text",
    role: "title",
    text: "Hello",
    zIndex: 0,
    box: { x: 5, y: 5, w: 90, h: 20 },
    style: {
      fontSize: 6,
      bold: true,
      italic: false,
      align: "left",
    },
    ...overrides,
  } as unknown as TextElement;
}

function deck(element: TextElement): Deck {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: {
      themeId: "default",
      themeOverrides: {
        tokenSet: {
          id: "brand:x",
          name: "Brand X",
          colors: {
            slideBg: "#101010",
            surface: "#202020",
            accent: "#ff8800",
            onBg: "#fafafa",
            onSurface: "#eeeeee",
            onAccent: "#000000",
            muted: "#999999",
          },
          typography: {
            fontFamily: "Roboto, sans-serif",
            headingFontFamily: "Oswald, sans-serif",
            scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
          },
          spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
          shape: { cornerRadiusPt: 4, shadowCss: "none" },
          defaultBackground: { type: "solid", color: "#101010" },
        },
      },
    },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        bullets: [],
        notes: "",
        elements: [element],
      },
    ],
  } as Deck;
}

test("renderer/export text adapters keep inherited color and font in parity", () => {
  const element = textElement();
  const source = deck(element);
  const renderer = adaptTextElementForRenderer(source, element);
  const exported = adaptTextElementForExport(source, element, SLIDE_HEIGHT_PT);

  assert.equal(renderer.color, "#fafafa");
  assert.equal(exported.color, "#fafafa");
  assert.equal(renderer.fontFamily, "Oswald, 'Noto Sans SC', sans-serif");
  assert.equal(exported.fontFace, "Oswald");
  assert.equal(renderer.resolved.origin.color, "deck");
  assert.equal(exported.resolved.origin.fontFamily, "deck");
});

test("renderer/export text adapters track local override origin consistently", () => {
  const element = textElement({
    designOverrides: {
      textStyle: {
        color: "#00ff00",
        fontId: "inter",
        bold: false,
        italic: true,
      },
    },
  });
  const source = deck(element);
  const renderer = adaptTextElementForRenderer(source, element);
  const exported = adaptTextElementForExport(source, element, SLIDE_HEIGHT_PT);

  assert.equal(renderer.color, "#00ff00");
  assert.equal(exported.color, "#00ff00");
  assert.equal(renderer.fontFamily, "'Inter', 'Noto Sans SC', sans-serif");
  assert.equal(exported.fontFace, "Aptos");
  assert.equal(renderer.fontWeight, 400);
  assert.equal(exported.bold, false);
  assert.equal(exported.italic, true);
  assert.equal(renderer.resolved.origin.color, "element");
  assert.equal(exported.resolved.origin.weight, "element");
});

test("renderer/export adapters omit optional fields when the resolved style does not define them", () => {
  const element = textElement({
    role: "body",
    designOverrides: {
      textStyle: {
        color: "#112233",
        fontSize: 5,
        bold: false,
        italic: false,
        underline: false,
        align: "center",
      },
    },
  });
  const source = deck(element);
  const renderer = adaptTextElementForRenderer(source, element);
  const exported = adaptTextElementForExport(source, element, SLIDE_HEIGHT_PT);

  assert.equal(renderer.lineHeight, undefined);
  assert.equal(renderer.paragraphSpacingCqh, undefined);
  assert.equal(exported.lineHeight, undefined);
  assert.equal(exported.paragraphSpacingPt, undefined);
  assert.equal(exported.bold, false);
});

test("shape label renderer/export adapters convert resolved label styles", () => {
  const shape = {
    id: "shape-label",
    kind: "shape",
    role: "label",
    zIndex: 0,
    box: { x: 5, y: 5, w: 20, h: 10 },
    content: { kind: "shape", shape: "rect", text: "Label" },
    designOverrides: {
      textStyle: {
        color: "#445566",
        fontId: "source-serif-4",
        fontSize: 4,
        bold: true,
        italic: true,
        underline: true,
        align: "right",
        lineHeight: 1.4,
        paragraphSpacing: 0.8,
      },
    },
  } as any;
  const source = deck(shape as never);
  const renderer = adaptShapeLabelForRenderer(source, shape);
  const exported = adaptShapeLabelForExport(source, shape, SLIDE_HEIGHT_PT);

  assert.equal(renderer.fontFamily, "'Source Serif 4', 'Noto Sans SC', serif");
  assert.equal(exported.fontFace, "Georgia");
  assert.equal(exported.bold, true);
  assert.equal(exported.italic, true);
  assert.equal(exported.underline, true);
  assert.equal(exported.paragraphSpacingPt, 6);
});
