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
  resolveSlideStyle,
} from "./style-cascade";

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "s1",
    index: 0,
    title: "Test Slide",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
    ...overrides,
  };
}

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    theme: "default",
    slides: [],
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// resolveSlideStyle — token fallback
// ---------------------------------------------------------------------------

test("resolveSlideStyle returns token set background when no overrides", () => {
  const deck = makeDeck({ theme: "indigo" });
  const slide = makeSlide({ theme: "indigo" });
  const resolved = resolveSlideStyle(deck, slide);
  // indigo slideBg = "#ffffff"
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#ffffff");
  }
});

test("resolveSlideStyle uses ocean token set for ocean theme", () => {
  const deck = makeDeck({ theme: "ocean" });
  const slide = makeSlide({ theme: "ocean" });
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
    theme: "default",
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
  const deck = makeDeck({ theme: "indigo" });
  const slide = makeSlide({ background: "#123456" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#123456");
  }
});

test("resolveSlideStyle applies slide.backgroundGradient override", () => {
  const deck = makeDeck({ theme: "default" });
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
  const deck = makeDeck({ theme: "default" });
  const slide = makeSlide({ backgroundImage: "https://example.com/img.jpg" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "image");
  if (resolved.background.type === "image") {
    assert.equal(resolved.background.url, "https://example.com/img.jpg");
  }
});

test("resolveSlideStyle applies slide.accent override", () => {
  const deck = makeDeck({ theme: "default" });
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
  const deck = makeDeck({ theme: "default" });
  const slide = makeSlide({ background: "#ff0000" });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.backgroundCss, "#ff0000");
});

test("resolveSlideStyle provides correct backgroundCss for gradient", () => {
  const deck = makeDeck({ theme: "default" });
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
