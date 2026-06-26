/**
 * Tests for style-cascade.ts — resolveMaster and resolveSlideStyle.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import type { MasterSlide } from "./deck-theme-tokens";
import {
  renderFooterText,
  resolveMaster,
  resolveRoleTextStyle,
  resolveShapeLabelStyle,
  resolveSlideStyle,
  resolveSlideThemeColors,
  resolveTextElementStyle,
  STYLE_CASCADE_LAYERS,
} from "./style-cascade";
import { buildDeck, buildSlide } from "@/test/builders/deck";

const makeSlide = (overrides: Partial<Slide> = {}): Slide =>
  buildSlide({ id: "s1", title: "Test Slide", bullets: [], ...overrides });

const makeDeck = (overrides: Partial<Deck> = {}): Deck =>
  buildDeck({ slides: [], ...overrides });

function makeMaster(overrides: Partial<MasterSlide> = {}): MasterSlide {
  return {
    id: "m1",
    name: "Default Master",
    themeId: "default",
    showPageNumbers: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveMaster
// ---------------------------------------------------------------------------

test("resolveMaster returns undefined when deck has no masters", () => {
  const deck = makeDeck();
  const slide = makeSlide();
  assert.equal(resolveMaster(deck, slide), undefined);
});

test("resolveMaster returns undefined when masters array is empty", () => {
  const deck = makeDeck({ masters: [] });
  const slide = makeSlide();
  assert.equal(resolveMaster(deck, slide), undefined);
});

test("resolveMaster returns first master when slide has no masterRef", () => {
  const master1 = makeMaster({ id: "m1" });
  const master2 = makeMaster({ id: "m2" });
  const deck = makeDeck({ masters: [master1, master2] });
  const slide = makeSlide();
  const resolved = resolveMaster(deck, slide);
  assert.equal(resolved?.id, "m1");
});

test("resolveMaster returns the correct master by masterRef", () => {
  const master1 = makeMaster({ id: "m1" });
  const master2 = makeMaster({ id: "m2" });
  const deck = makeDeck({ masters: [master1, master2] });
  const slide = makeSlide({ masterRef: "m2" });
  const resolved = resolveMaster(deck, slide);
  assert.equal(resolved?.id, "m2");
});

test("resolveMaster returns undefined when masterRef does not match any master", () => {
  const master = makeMaster({ id: "m1" });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide({ masterRef: "non-existent" });
  const resolved = resolveMaster(deck, slide);
  assert.equal(resolved, undefined);
});

test("documents the stable five cascade layers in order", () => {
  assert.deepEqual(STYLE_CASCADE_LAYERS, [
    "deck",
    "master",
    "layout",
    "slide",
    "element",
  ]);
});

// ---------------------------------------------------------------------------
// resolveSlideStyle — token fallback
// ---------------------------------------------------------------------------

test("resolveSlideStyle returns token set background when no overrides", () => {
  const deck = makeDeck({ themeId: "indigo" });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  // indigo slideBg = "#ffffff"
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#ffffff");
  }
});

test("resolveSlideStyle uses ocean token set for ocean theme", () => {
  const deck = makeDeck({ themeId: "ocean" });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  // ocean slideBg = "#f6fbff"
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#f6fbff");
  }
  assert.equal(resolved.accent, "#0284c7");
});

test("resolveSlideStyle uses customTokenSet when present", () => {
  const deck = makeDeck({
    themeId: "default",
    customTokenSet: {
      id: "brand:x",
      name: "Custom",
      colors: {
        slideBg: "#aabbcc",
        surface: "#ffffff",
        accent: "#ff0000",
        onBg: "#000000",
        onSurface: "#111111",
        onAccent: "#ffffff",
        muted: "#888888",
      },
      typography: {
        fontFamily: "Arial",
        scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
      },
      spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
      shape: { cornerRadiusPt: 4, shadowCss: "none" },
      defaultBackground: { type: "solid", color: "#aabbcc" },
    },
  });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#aabbcc");
  }
  assert.equal(resolved.accent, "#ff0000");
});

// ---------------------------------------------------------------------------
// resolveSlideStyle — slide-level overrides
// ---------------------------------------------------------------------------

test("resolveSlideStyle applies slide.background override", () => {
  const deck = makeDeck({ themeId: "indigo" });
  const slide = makeSlide({ background: "#123456" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#123456");
  }
});

test("resolveSlideStyle applies slide.backgroundGradient override", () => {
  const deck = makeDeck({ themeId: "default" });
  const slide = makeSlide({
    backgroundGradient: { from: "#ff0000", to: "#0000ff", angle: 45 },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "gradient");
  if (resolved.background.type === "gradient") {
    assert.equal(resolved.background.from, "#ff0000");
    assert.equal(resolved.background.to, "#0000ff");
    assert.equal(resolved.background.angle, 45);
  }
});

test("resolveSlideStyle applies slide.backgroundImage override", () => {
  const deck = makeDeck({ themeId: "default" });
  const slide = makeSlide({ backgroundImage: "https://example.com/img.jpg" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "image");
  if (resolved.background.type === "image") {
    assert.equal(resolved.background.url, "https://example.com/img.jpg");
  }
});

test("resolveSlideStyle applies slide.accent override", () => {
  const deck = makeDeck({ themeId: "default" });
  const slide = makeSlide({ accent: "#ff9900" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.accent, "#ff9900");
});

// ---------------------------------------------------------------------------
// resolveSlideStyle — master layer
// ---------------------------------------------------------------------------

test("resolveSlideStyle applies master background when slide has no override", () => {
  const master = makeMaster({
    background: { type: "solid", color: "#001122" },
  });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#001122");
  }
});

test("resolveSlideStyle slide background overrides master background", () => {
  const master = makeMaster({
    background: { type: "solid", color: "#001122" },
  });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide({ background: "#aabbcc" });
  const resolved = resolveSlideStyle(deck, slide);
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#aabbcc");
  }
});

test("resolveSlideStyle exposes master in result", () => {
  const master = makeMaster({ id: "m1" });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.master?.id, "m1");
});

test("resolveSlideStyle exposes showPageNumbers from master", () => {
  const master = makeMaster({ showPageNumbers: true });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.showPageNumbers, true);
});

test("resolveSlideStyle showPageNumbers defaults to false with no master", () => {
  const deck = makeDeck();
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.showPageNumbers, false);
});

test("resolveSlideStyle falls back when optional master chrome fields are absent", () => {
  const master = makeMaster();
  const deck = makeDeck({ masters: [master] });
  const resolved = resolveSlideStyle(deck, makeSlide());

  assert.equal(resolved.footerText, undefined);
  assert.equal(resolved.logoUrl, undefined);
  assert.equal(resolved.logoPlacement, undefined);
  assert.equal(resolved.showPageNumbers, false);
});

test("resolveSlideStyle exposes footerText from master", () => {
  const master = makeMaster({ footerText: "Slide {{pageNumber}}" });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.footerText, "Slide {{pageNumber}}");
});

test("resolveSlideStyle exposes logoUrl and logoPlacement from master", () => {
  const master = makeMaster({
    logoUrl: "https://example.com/logo.png",
    logoPlacement: "top-left",
  });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.logoUrl, "https://example.com/logo.png");
  assert.equal(resolved.logoPlacement, "top-left");
});

// ---------------------------------------------------------------------------
// backgroundCss
// ---------------------------------------------------------------------------

test("resolveSlideStyle provides correct backgroundCss for solid", () => {
  const deck = makeDeck({ themeId: "default" });
  const slide = makeSlide({ background: "#ff0000" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.backgroundCss, "#ff0000");
});

test("resolveSlideStyle provides correct backgroundCss for gradient", () => {
  const deck = makeDeck({ themeId: "default" });
  const slide = makeSlide({
    backgroundGradient: { from: "#111", to: "#222", angle: 90 },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.backgroundCss, "linear-gradient(90deg, #111, #222)");
});

// ---------------------------------------------------------------------------
// renderFooterText
// ---------------------------------------------------------------------------

test("renderFooterText replaces {{pageNumber}} with 1-based index", () => {
  assert.equal(renderFooterText("Page {{pageNumber}}", 0), "Page 1");
  assert.equal(renderFooterText("Page {{pageNumber}}", 4), "Page 5");
});

test("renderFooterText replaces multiple occurrences", () => {
  assert.equal(
    renderFooterText("Slide {{pageNumber}} of N — slide {{pageNumber}}", 2),
    "Slide 3 of N — slide 3",
  );
});

test("renderFooterText returns template unchanged when no token present", () => {
  assert.equal(renderFooterText("Confidential", 0), "Confidential");
});

// ---------------------------------------------------------------------------
// resolved text / bullet / shape-label styles (#602)
// ---------------------------------------------------------------------------

test("resolveRoleTextStyle uses the deck role token when no override", () => {
  const deck = makeDeck();
  const tokenSet = resolveSlideStyle(deck, makeSlide()).tokenSet;
  const style = resolveRoleTextStyle(tokenSet, "h1");
  // default themeId: h1 size 36, bold weight 700, centered
  assert.strictEqual(style.fontSize, 36);
  assert.strictEqual(style.weight, 700);
  assert.strictEqual(style.align, "center");
  assert.strictEqual(style.role, "h1");
  assert.strictEqual(style.origin.fontSize, "deck");
  assert.strictEqual(style.origin.color, "deck");
});

test("resolveRoleTextStyle: a local override wins and is tagged element", () => {
  const tokenSet = resolveSlideStyle(makeDeck(), makeSlide()).tokenSet;
  const style = resolveRoleTextStyle(tokenSet, "body", {
    color: "#abcabc",
    bold: true,
    align: "right",
  });
  assert.strictEqual(style.color, "#abcabc");
  assert.strictEqual(style.weight, 700);
  assert.strictEqual(style.align, "right");
  assert.strictEqual(style.origin.color, "element");
  assert.strictEqual(style.origin.weight, "element");
  assert.strictEqual(style.origin.align, "element");
  // untouched fields stay inherited
  assert.strictEqual(style.origin.fontSize, "deck");
});

test("resolveRoleTextStyle: deleting an override restores the inherited value", () => {
  const tokenSet = resolveSlideStyle(makeDeck(), makeSlide()).tokenSet;
  const overridden = resolveRoleTextStyle(tokenSet, "h2", { color: "#123456" });
  const reset = resolveRoleTextStyle(tokenSet, "h2", {});
  assert.strictEqual(overridden.color, "#123456");
  assert.strictEqual(overridden.origin.color, "element");
  // reset (override field removed) -> inherited deck color
  assert.strictEqual(reset.color, tokenSet.colors.onBg);
  assert.strictEqual(reset.origin.color, "deck");
});

test("resolveRoleTextStyle tracks absent optional fields as deck fallbacks", () => {
  const tokenSet = resolveSlideStyle(makeDeck(), makeSlide()).tokenSet;
  const style = resolveRoleTextStyle(tokenSet, "body");

  assert.equal(style.lineHeight, undefined);
  assert.equal(style.paragraphSpacing, undefined);
  assert.equal(style.origin.lineHeight, "deck");
  assert.equal(style.origin.paragraphSpacing, "deck");
});

test("resolveTextElementStyle maps text role title -> h1, body -> body", () => {
  const deck = makeDeck();
  const title = resolveTextElementStyle(deck, { textRole: "h1" });
  const body = resolveTextElementStyle(deck, {});
  assert.strictEqual(title.role, "h1");
  assert.strictEqual(body.role, "body");
  assert.strictEqual(title.fontSize, 36);
  assert.strictEqual(body.fontSize, 16);
});

test("resolveTextElementStyle honors an explicit textRole over text role", () => {
  const deck = makeDeck();
  const style = resolveTextElementStyle(deck, {
    textRole: "caption",
  });
  assert.strictEqual(style.role, "caption");
});

test("resolveShapeLabelStyle defaults to shapeLabel and reads textStyleOverride", () => {
  const style = resolveShapeLabelStyle(makeDeck(), {
    textStyleOverride: { color: "#0a0a0a" },
  });
  assert.strictEqual(style.role, "shapeLabel");
  assert.strictEqual(style.color, "#0a0a0a");
  assert.strictEqual(style.origin.color, "element");
});

// ---------------------------------------------------------------------------
// resolveSlideThemeColors (#609)
// ---------------------------------------------------------------------------

test("resolveSlideThemeColors uses deck cascade colors (default theme)", () => {
  const deck = makeDeck({ themeId: "default" });
  const colors = resolveSlideThemeColors(deck, makeSlide());
  // default token set: light slide background, dark onBg text
  assert.strictEqual(colors.bgColor, "#ffffff");
  assert.strictEqual(colors.titleColor, "#0f172a");
  assert.strictEqual(colors.bodyColor, "#0f172a");
  assert.strictEqual(colors.mutedColor, "#64748b");
});

test("resolveSlideThemeColors resolves a different built-in deck theme", () => {
  const deck = makeDeck({ themeId: "indigo" });
  const colors = resolveSlideThemeColors(deck, makeSlide());
  // indigo token set: still a light background with a theme-dark onBg
  assert.strictEqual(colors.bgColor, "#ffffff");
  assert.strictEqual(colors.titleColor, "#1e1b4b");
  assert.strictEqual(colors.accentColor, "#4f46e5");
});

test("resolveSlideThemeColors honors a deck custom token set", () => {
  const deck = makeDeck({
    themeId: "default",
    customTokenSet: {
      id: "brand:x",
      name: "X",
      colors: {
        slideBg: "#101010",
        surface: "#202020",
        accent: "#ff0000",
        onBg: "#fafafa",
        onSurface: "#eeeeee",
        onAccent: "#ffffff",
        muted: "#999999",
      },
      typography: {
        fontFamily: "Inter",
        scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
      },
      spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
      shape: { cornerRadiusPt: 4, shadowCss: "none" },
      defaultBackground: { type: "solid", color: "#101010" },
    },
  });
  const colors = resolveSlideThemeColors(deck, makeSlide());
  assert.strictEqual(colors.bgColor, "#101010");
  assert.strictEqual(colors.titleColor, "#fafafa");
  assert.strictEqual(colors.accentColor, "#ff0000");
});

test("resolveSlideThemeColors keeps slide background and accent overrides first class", () => {
  const deck = makeDeck({
    themeId: "ocean",
    slides: [],
  });
  const colors = resolveSlideThemeColors(
    deck,
    makeSlide({
      background: "#123456",
      accent: "#fedcba",
    }),
  );
  assert.strictEqual(colors.bgColor, "#123456");
  assert.strictEqual(colors.accentColor, "#fedcba");
  assert.strictEqual(colors.titleColor, "#0c4a6e");
});

test("resolveSlideThemeColors is the shared editor and viewer chrome color source", () => {
  const deck = makeDeck({
    themeId: "default",
    customTokenSet: {
      id: "brand:shared",
      name: "Shared",
      colors: {
        slideBg: "#101820",
        surface: "#1f2a33",
        accent: "#f2aa4c",
        onBg: "#f7f4ef",
        onSurface: "#ffffff",
        onAccent: "#101820",
        muted: "#b9c0c8",
      },
      typography: {
        fontFamily: "Inter",
        scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
      },
      spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
      shape: { cornerRadiusPt: 4, shadowCss: "none" },
      defaultBackground: { type: "solid", color: "#101820" },
    },
  });
  const slide = makeSlide();
  const editorStageColors = resolveSlideThemeColors(deck, slide);
  const presentChromeColors = resolveSlideThemeColors(deck, slide);
  const publicViewerColors = resolveSlideThemeColors(deck, slide);
  assert.deepEqual(presentChromeColors, editorStageColors);
  assert.deepEqual(publicViewerColors, editorStageColors);
});

test("resolveSlideThemeColors collapses a slide gradient background to its from-stop", () => {
  const deck = makeDeck({ themeId: "default" });
  const colors = resolveSlideThemeColors(
    deck,
    makeSlide({
      backgroundGradient: { from: "#123456", to: "#654321" },
    }),
  );
  assert.strictEqual(colors.bgColor, "#123456");
});
