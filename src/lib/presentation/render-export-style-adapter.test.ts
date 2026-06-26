import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, TextElement } from "./deck";
import {
  adaptTextElementForExport,
  adaptTextElementForRenderer,
} from "./render-export-style-adapter";

const SLIDE_HEIGHT_PT = 540;

function textElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "t1",
    kind: "text",
    role: "title",
    textRole: "h1",
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
  };
}

function deck(element: TextElement): Deck {
  return {
    themeId: "default",
    customTokenSet: {
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
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        elements: [element],
      },
    ],
  };
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
    styleOverride: {
      color: "#00ff00",
      fontId: "inter",
      bold: false,
      italic: true,
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
