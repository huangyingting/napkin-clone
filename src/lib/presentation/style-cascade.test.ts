/**
 * Tests for style-cascade.ts — resolveMaster and resolveSlideStyle.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type Slide,
  type SlideMaster,
} from "./deck";
import {
  resolveMaster,
  resolveRoleTextStyle,
  resolveShapeLabelStyle,
  resolveSlideStyle,
  resolveSlideThemeColors,
  resolveTextElementStyle,
  STYLE_CASCADE_LAYERS,
} from "./style-cascade";
import { buildDeck, buildSlide } from "@/test/builders/deck";

const makeSlide = (overrides: Record<string, any> = {}): Slide =>
  buildSlide({ id: "s1", title: "Test Slide", bullets: [], ...overrides });

const makeDeck = (overrides: Record<string, any> = {}): Deck =>
  buildDeck({ slides: [], ...overrides });

function makeMaster(overrides: Partial<SlideMaster> = {}): SlideMaster {
  return {
    id: "m1",
    name: "Default Master",
    elements: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveMaster
// ---------------------------------------------------------------------------

test("resolveMaster returns undefined when deck has no masters", () => {
  const deck = {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    slides: [],
  } as unknown as Deck;
  const slide = makeSlide();
  assert.equal(resolveMaster(deck, slide), undefined);
});

test("resolveMaster returns undefined when masters array is empty", () => {
  const deck = makeDeck({ masters: [] });
  const slide = makeSlide();
  assert.equal(resolveMaster(deck, slide), undefined);
});

test("resolveMaster returns the deck default master", () => {
  const master1 = makeMaster({ id: "m1" });
  const master2 = makeMaster({ id: "m2" });
  const deck = makeDeck({ masters: [master1, master2], defaultMasterId: "m2" });
  const slide = makeSlide();
  const resolved = resolveMaster(deck, slide);
  assert.equal(resolved?.id, "m2");
});

test("resolveMaster ignores per-slide masterId", () => {
  const master1 = makeMaster({ id: "m1" });
  const master2 = makeMaster({ id: "m2" });
  const deck = makeDeck({ masters: [master1, master2] });
  const slide = makeSlide({ masterId: "m2" });
  const resolved = resolveMaster(deck, slide);
  assert.equal(resolved?.id, "m1");
});

test("resolveMaster falls back to first master when defaultMasterId is missing", () => {
  const master = makeMaster({ id: "m1" });
  const deck = makeDeck({ masters: [master], defaultMasterId: "non-existent" });
  const slide = makeSlide({ masterId: "non-existent" });
  const resolved = resolveMaster(deck, slide);
  assert.equal(resolved?.id, "m1");
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
  const deck = makeDeck({ design: { themeId: "indigo" } });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  // indigo slideBg = "#ffffff"
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#ffffff");
  }
});

test("resolveSlideStyle uses ocean token set for ocean theme", () => {
  const deck = makeDeck({ design: { themeId: "ocean" } });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  // ocean slideBg = "#f6fbff"
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#f6fbff");
  }
  assert.equal(resolved.accent, "#0284c7");
});

test("resolveSlideStyle uses theme override token set when present", () => {
  const deck = makeDeck({
    design: {
      themeId: "default",
      themeOverrides: {
        tokenSet: {
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
          defaultBackground: { type: "solid", color: "#aabbcc" },
        },
      },
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
  const deck = makeDeck({ design: { themeId: "indigo" } });
  const slide = makeSlide({
    designOverrides: {
      background: { type: "solid", color: { value: "#123456" } },
    },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#123456");
  }
});

test("resolveSlideStyle applies slide.backgroundGradient override", () => {
  const deck = makeDeck({ design: { themeId: "default" } });
  const slide = makeSlide({
    designOverrides: {
      background: {
        type: "gradient",
        from: { value: "#ff0000" },
        to: { value: "#0000ff" },
        angle: 45,
      },
    },
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
  const deck = makeDeck({ design: { themeId: "default" } });
  const slide = makeSlide({
    designOverrides: {
      background: { type: "image", url: "https://example.com/img.jpg" },
    },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "image");
  if (resolved.background.type === "image") {
    assert.equal(resolved.background.url, "https://example.com/img.jpg");
  }
});

test("resolveSlideStyle applies slide.accent override", () => {
  const deck = makeDeck({ design: { themeId: "default" } });
  const slide = makeSlide({
    designOverrides: { accent: { value: "#ff9900" } },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.accent, "#ff9900");
});

test("resolveSlideStyle ignores unresolved color tokens and invalid backgrounds", () => {
  const deck = makeDeck({ design: { themeId: "ocean" } });
  const slide = makeSlide({
    designOverrides: {
      accent: { token: "missing-token" },
      background: {
        type: "gradient",
        from: { token: "missing-from" },
        to: { value: "#ffffff" },
      },
    },
  });

  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#f6fbff");
  }
  assert.equal(resolved.accent, "#0284c7");
});

test("resolveSlideStyle exposes heading and body font families", () => {
  const deck = makeDeck({ design: { themeId: "indigo" } });
  const resolved = resolveSlideStyle(deck, makeSlide());

  assert.equal(
    resolved.headingFontFamily,
    "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
  );
  assert.equal(
    resolved.bodyFontFamily,
    "Inter, ui-sans-serif, system-ui, sans-serif",
  );
});

test("resolveSlideStyle exposes theme text colors", () => {
  const deck = makeDeck({ design: { themeId: "indigo" } });
  const resolved = resolveSlideStyle(deck, makeSlide());

  assert.equal(resolved.titleColor, "#1e1b4b");
  assert.equal(resolved.bodyColor, "#1e1b4b");
  assert.equal(resolved.mutedColor, "#6366f1");
});

// ---------------------------------------------------------------------------
// resolveSlideStyle — master layer
// ---------------------------------------------------------------------------

test("resolveSlideStyle applies master background when slide has no override", () => {
  const master = makeMaster({
    background: { type: "solid", color: { value: "#001122" } },
  });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide();
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#001122");
  }
});

test("resolveSlideStyle falls back to master background and resolves accent tokens", () => {
  const deck = makeDeck({
    design: { themeId: "ocean" },
    masters: [
      makeMaster({
        id: "master-default",
        background: { type: "solid", color: { value: "#ddeeff" } },
      }),
    ],
    defaultMasterId: "master-default",
  });
  const slide = makeSlide({
    designOverrides: { accent: { token: "muted" } },
  });

  const resolved = resolveSlideStyle(deck, slide);

  assert.equal(resolved.background.type, "solid");
  if (resolved.background.type === "solid") {
    assert.equal(resolved.background.color, "#ddeeff");
  }
  assert.equal(resolved.accent, resolved.tokenSet.colors.muted);
});

test("resolveSlideStyle slide background overrides master background", () => {
  const master = makeMaster({
    background: { type: "solid", color: { value: "#001122" } },
  });
  const deck = makeDeck({ masters: [master] });
  const slide = makeSlide({
    designOverrides: {
      background: { type: "solid", color: { value: "#aabbcc" } },
    },
  });
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

// ---------------------------------------------------------------------------
// backgroundCss
// ---------------------------------------------------------------------------

test("resolveSlideStyle provides correct backgroundCss for solid", () => {
  const deck = makeDeck({ design: { themeId: "default" } });
  const slide = makeSlide({
    designOverrides: {
      background: { type: "solid", color: { value: "#ff0000" } },
    },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.backgroundCss, "#ff0000");
});

test("resolveSlideStyle provides correct backgroundCss for gradient", () => {
  const deck = makeDeck({ design: { themeId: "default" } });
  const slide = makeSlide({
    designOverrides: {
      background: {
        type: "gradient",
        from: { value: "#111" },
        to: { value: "#222" },
        angle: 90,
      },
    },
  });
  const resolved = resolveSlideStyle(deck, slide);
  assert.equal(resolved.backgroundCss, "linear-gradient(90deg, #111, #222)");
});

// ---------------------------------------------------------------------------
// resolved text / bullet / shape-label styles (#602)
// ---------------------------------------------------------------------------

test("resolveRoleTextStyle uses the deck role token when no override", () => {
  const deck = makeDeck();
  const tokenSet = resolveSlideStyle(deck, makeSlide()).tokenSet;
  const style = resolveRoleTextStyle(tokenSet, "title");
  // default themeId: title size 36, bold weight 700, centered
  assert.strictEqual(style.fontSize, 36);
  assert.strictEqual(style.weight, 700);
  assert.strictEqual(style.align, "center");
  assert.strictEqual(style.role, "title");
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
  const overridden = resolveRoleTextStyle(tokenSet, "sectionTitle", {
    color: "#123456",
  });
  const reset = resolveRoleTextStyle(tokenSet, "sectionTitle", {});
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

test("resolveTextElementStyle maps presentation roles directly", () => {
  const deck = makeDeck();
  const title = resolveTextElementStyle(deck, { role: "title" });
  const body = resolveTextElementStyle(deck, {});
  assert.strictEqual(title.role, "title");
  assert.strictEqual(body.role, "body");
  assert.strictEqual(title.fontSize, 36);
  assert.strictEqual(body.fontSize, 16);
});

test("resolveTextElementStyle honors an explicit presentation role", () => {
  const deck = makeDeck();
  const style = resolveTextElementStyle(deck, {
    role: "caption",
  });
  assert.strictEqual(style.role, "caption");
});

test("resolveShapeLabelStyle defaults to label and reads designOverrides.textStyle", () => {
  const style = resolveShapeLabelStyle(makeDeck(), {
    designOverrides: { textStyle: { color: "#0a0a0a" } },
  });
  assert.strictEqual(style.role, "label");
  assert.strictEqual(style.color, "#0a0a0a");
  assert.strictEqual(style.origin.color, "element");
});

// ---------------------------------------------------------------------------
// resolveSlideThemeColors (#609)
// ---------------------------------------------------------------------------

test("resolveSlideThemeColors uses deck cascade colors (default theme)", () => {
  const deck = makeDeck({ design: { themeId: "default" } });
  const colors = resolveSlideThemeColors(deck, makeSlide());
  // default token set: light slide background, dark onBg text
  assert.strictEqual(colors.bgColor, "#ffffff");
  assert.strictEqual(colors.titleColor, "#0f172a");
  assert.strictEqual(colors.bodyColor, "#0f172a");
  assert.strictEqual(colors.mutedColor, "#64748b");
});

test("resolveSlideThemeColors resolves a different built-in presentation theme", () => {
  const deck = makeDeck({ design: { themeId: "indigo" } });
  const colors = resolveSlideThemeColors(deck, makeSlide());
  // indigo token set: still a light background with a theme-dark onBg
  assert.strictEqual(colors.bgColor, "#ffffff");
  assert.strictEqual(colors.titleColor, "#1e1b4b");
  assert.strictEqual(colors.accentColor, "#4f46e5");
});

test("resolveSlideThemeColors honors a presentation theme override token set", () => {
  const deck = makeDeck({
    design: {
      themeId: "default",
      themeOverrides: {
        tokenSet: {
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
          defaultBackground: { type: "solid", color: "#101010" },
        },
      },
    },
  });
  const colors = resolveSlideThemeColors(deck, makeSlide());
  assert.strictEqual(colors.bgColor, "#101010");
  assert.strictEqual(colors.titleColor, "#fafafa");
  assert.strictEqual(colors.accentColor, "#ff0000");
});

test("resolveSlideThemeColors keeps slide background and accent overrides first class", () => {
  const deck = makeDeck({
    design: { themeId: "ocean" },
    slides: [],
  });
  const colors = resolveSlideThemeColors(
    deck,
    makeSlide({
      designOverrides: {
        background: { type: "solid", color: { value: "#123456" } },
        accent: { value: "#fedcba" },
      },
    }),
  );
  assert.strictEqual(colors.bgColor, "#123456");
  assert.strictEqual(colors.accentColor, "#fedcba");
  assert.strictEqual(colors.titleColor, "#0c4a6e");
});

test("resolveSlideThemeColors is the shared editor and viewer chrome color source", () => {
  const deck = makeDeck({
    design: {
      themeId: "default",
      themeOverrides: {
        tokenSet: {
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
          defaultBackground: { type: "solid", color: "#101820" },
        },
      },
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
  const deck = makeDeck({ design: { themeId: "default" } });
  const colors = resolveSlideThemeColors(
    deck,
    makeSlide({
      designOverrides: {
        background: {
          type: "gradient",
          from: { value: "#123456" },
          to: { value: "#654321" },
        },
      },
    }),
  );
  assert.strictEqual(colors.bgColor, "#123456");
});
