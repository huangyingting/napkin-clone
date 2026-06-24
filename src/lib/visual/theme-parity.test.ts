/**
 * Theme parity regression coverage (#608).
 *
 * The editor and presentation viewers render via `SlideCanvas` (which resolves
 * colours through `resolveSlideThemeColors`), while export emits native slide
 * specs via `buildDeckSpecs`. Both must derive inherited text colour and font
 * from the SAME deck token cascade so a deck looks the same in the editor,
 * present mode, the public viewer, and an exported PPTX.
 *
 * These tests pin renderer↔export parity for inherited H1/body/bullet styles,
 * across a built-in theme and a custom (brand-derived) token set, and confirm
 * local element overrides win identically on both surfaces.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BulletsElement,
  Deck,
  Slide,
  TextElement,
} from "@/lib/presentation/deck";
import { resolveSlideThemeColors } from "@/lib/presentation/style-cascade";
import {
  resolveRoleToken,
  resolveThemeTokens,
  type DeckThemeTokenSet,
} from "@/lib/presentation/deck-theme-tokens";
import {
  buildDeckSpecs,
  type DeckBulletsOp,
  type DeckTextOp,
} from "@/lib/visual/deck-export";

function titleEl(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "title",
    kind: "text",
    role: "title",
    textRole: "h1",
    text: "Heading",
    zIndex: 0,
    box: { x: 6, y: 6, w: 88, h: 16 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
    ...overrides,
  };
}

function bodyBulletsEl(
  overrides: Partial<BulletsElement> = {},
): BulletsElement {
  return {
    id: "b",
    kind: "bullets",
    bullets: ["point"],
    items: [{ text: "point" }],
    zIndex: 1,
    box: { x: 6, y: 26, w: 88, h: 60 },
    style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
    ...overrides,
  };
}

function slide(elements: (TextElement | BulletsElement)[]): Slide {
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
  };
}

const BRAND: DeckThemeTokenSet = {
  id: "brand:x",
  name: "X",
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
};

/** Renderer-side resolved title color (what SlideCanvas paints). */
function rendererTitleColor(deck: Deck): string {
  return resolveSlideThemeColors(deck, deck.slides[0]!).titleColor;
}

/** Export-side emitted title color. */
function exportTitleColor(deck: Deck): string {
  const [spec] = buildDeckSpecs(deck, new Map());
  return (
    spec.ops.find((o): o is DeckTextOp => o.kind === "text") as DeckTextOp
  ).color;
}

function exportTitleFont(deck: Deck): string | undefined {
  const [spec] = buildDeckSpecs(deck, new Map());
  return (
    spec.ops.find((o): o is DeckTextOp => o.kind === "text") as DeckTextOp
  ).fontFace;
}

function exportBulletColor(deck: Deck): string {
  const [spec] = buildDeckSpecs(deck, new Map());
  return (
    spec.ops.find(
      (o): o is DeckBulletsOp => o.kind === "bullets",
    ) as DeckBulletsOp
  ).color;
}

// ---------------------------------------------------------------------------
// Built-in theme parity
// ---------------------------------------------------------------------------

test("built-in theme: renderer and export emit the same inherited title color", () => {
  const deck: Deck = { theme: "default", slides: [slide([titleEl()])] };
  // toHex normalises to a 6-digit lowercase hex; renderer keeps the cascade hex.
  assert.equal(
    exportTitleColor(deck).toLowerCase(),
    rendererTitleColor(deck).replace("#", "").toLowerCase(),
  );
});

test("built-in theme: inherited title color equals the token onBg", () => {
  const deck: Deck = { theme: "indigo", slides: [slide([titleEl()])] };
  const onBg = resolveThemeTokens("indigo").colors.onBg;
  assert.equal(rendererTitleColor(deck), onBg);
});

// ---------------------------------------------------------------------------
// Custom token set parity
// ---------------------------------------------------------------------------

test("custom token set: renderer title color matches the brand onBg", () => {
  const deck: Deck = {
    theme: "default",
    customTokenSet: BRAND,
    slides: [slide([titleEl()])],
  };
  assert.equal(rendererTitleColor(deck), "#fafafa");
});

test("custom token set: export inherits the brand heading font for h1", () => {
  const deck: Deck = {
    theme: "default",
    customTokenSet: BRAND,
    slides: [slide([titleEl()])],
  };
  // h1 is a heading role → heading font stack "Oswald".
  assert.equal(exportTitleFont(deck), "Oswald");
  // and matches the cascade role token the renderer would inherit.
  assert.equal(resolveRoleToken(BRAND, "h1").fontFamily, "Oswald, sans-serif");
});

test("custom token set: export bullet color matches the brand onBg (body role)", () => {
  const deck: Deck = {
    theme: "default",
    customTokenSet: BRAND,
    slides: [slide([titleEl(), bodyBulletsEl()])],
  };
  assert.equal(exportBulletColor(deck).toLowerCase(), "fafafa");
});

// ---------------------------------------------------------------------------
// Local overrides win identically on both surfaces
// ---------------------------------------------------------------------------

test("a local color override wins in export regardless of the theme", () => {
  const deck: Deck = {
    theme: "default",
    customTokenSet: BRAND,
    slides: [
      slide([
        titleEl({
          style: {
            fontSize: 6,
            bold: true,
            italic: false,
            align: "left",
            color: "#00ff00",
          },
        }),
      ]),
    ],
  };
  assert.equal(exportTitleColor(deck).toLowerCase(), "00ff00");
});
