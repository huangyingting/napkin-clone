/**
 * Unit tests for export-preflight.ts (Epic #379, issue #416).
 *
 * Validates:
 *  - FATAL missing-asset diagnostics for image elements with no source.
 *  - WARNING raster-fallback for fitMode/mask/crop images in PPTX.
 *  - WARNING remote-image-failure for http/https image sources.
 *  - WARNING missing-font for custom font families in PPTX.
 *  - WARNING unsupported-pptx-feature for elbow connectors and gradients.
 *  - WARNING oversized-deck for decks exceeding the slide count threshold.
 *  - Image target skips PPTX-only checks.
 *  - hasFatal / hasWarnings / canExport flags are consistent with diagnostics.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import type {
  BulletsElement,
  ConnectorElement,
  Deck,
  ImageElement,
  Slide,
  SlideElement,
  TextElement,
} from "@/lib/presentation/deck";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/catalog";
import { resolveExportPolicy } from "@/lib/visual/export-policy";
import {
  DEFAULT_MAX_SLIDES,
  fatalDiagnostics,
  runExportPreflight,
  warningDiagnostics,
  type PreflightCode,
} from "@/lib/visual/export-preflight";
import { getOutputProfile } from "@/lib/visual/output-profiles";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSlide(
  elements: SlideElement[],
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id: "s1",
    index: 0,
    title: "Test slide",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements,
    ...overrides,
  };
}

function makeDeck(slides: Slide[], overrides: Partial<Deck> = {}): Deck {
  return {
    themeId: "default",
    slides,
    ...overrides,
  };
}

function imageEl(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: "img-1",
    kind: "image",
    src: "data:image/png;base64,abc",
    box: { x: 10, y: 10, w: 30, h: 20 },
    zIndex: 1,
    ...overrides,
  };
}

function textEl(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "txt-1",
    kind: "text",
    role: "title",
    text: "Hello",
    box: { x: 5, y: 5, w: 90, h: 15 },
    zIndex: 0,
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
    ...overrides,
  };
}

function bulletsEl(overrides: Partial<BulletsElement> = {}): BulletsElement {
  return {
    id: "bul-1",
    kind: "bullets",
    bullets: ["Item 1"],
    items: [{ text: "Item 1" }],
    box: { x: 5, y: 20, w: 90, h: 60 },
    zIndex: 0,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    ...overrides,
  };
}

function connectorEl(
  overrides: Partial<ConnectorElement> = {},
): ConnectorElement {
  return {
    id: "con-1",
    kind: "connector",
    routing: "straight",
    arrowStart: "none",
    arrowEnd: "arrow",
    box: { x: 10, y: 10, w: 30, h: 30 },
    zIndex: 2,
    start: { x: 10, y: 10 },
    end: { x: 40, y: 40 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function codesOf(
  result: ReturnType<typeof runExportPreflight>,
): PreflightCode[] {
  return result.diagnostics.map((d) => d.code);
}

// ---------------------------------------------------------------------------
// Tests: output profile and export policy context
// ---------------------------------------------------------------------------

describe("output profile and export policy context", () => {
  test("resolves output profile metadata from the shared catalog", () => {
    const deck = makeDeck([makeSlide([])]);
    const result = runExportPreflight(deck, {
      target: "image",
      outputProfile: "story",
    });
    const profile = getOutputProfile("story");
    assert.deepEqual(result.outputProfile, {
      id: profile.id,
      label: profile.label,
      canonicalWidth: profile.canonicalWidth,
      canonicalHeight: profile.canonicalHeight,
      aspectRatio: profile.aspectRatio,
      padding: profile.padding,
      background: profile.background,
      minScale: profile.minScale,
    });
  });

  test("carries centralized entitlement policy for watermark expectations", () => {
    const deck = makeDeck([makeSlide([])]);
    const policy = resolveExportPolicy(PLAN_ENTITLEMENTS.free);
    const result = runExportPreflight(deck, {
      target: "image",
      exportPolicy: policy,
    });
    assert.deepEqual(result.exportPolicy, {
      canSvg: false,
      canPptx: false,
      canRemoveWatermark: false,
      defaultWatermark: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: missing-asset (fatal)
// ---------------------------------------------------------------------------

describe("missing-asset diagnostics", () => {
  test("image with empty src and no assetId is FATAL missing-asset", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "", assetId: undefined })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(result.hasFatal, "should have fatal");
    assert.ok(!result.canExport, "canExport should be false");
    const fatal = fatalDiagnostics(result);
    assert.equal(fatal.length, 1);
    assert.equal(fatal[0].code, "missing-asset");
    assert.equal(fatal[0].severity, "fatal");
    assert.equal(fatal[0].slideIndex, 0);
    assert.equal(fatal[0].elementId, "img-1");
  });

  test("image with no src at all and no assetId is FATAL missing-asset", () => {
    const el = imageEl({ assetId: undefined });
    // Explicitly remove the src field to simulate a truly missing source.
    const elNoSrc = { ...el, src: "" };
    const deck = makeDeck([makeSlide([elNoSrc])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(result.hasFatal);
    assert.equal(fatalDiagnostics(result)[0].code, "missing-asset");
  });

  test("image with whitespace-only src is FATAL missing-asset", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "   ", assetId: undefined })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(result.hasFatal);
  });

  test("image with valid data URL src is not missing-asset", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "data:image/png;base64,abc" })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const missingFatal = fatalDiagnostics(result).filter(
      (d) => d.code === "missing-asset",
    );
    assert.equal(missingFatal.length, 0);
  });

  test("image with assetId (even no src) is not FATAL missing-asset", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "", assetId: "asset-uuid-1" })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const fatal = fatalDiagnostics(result).filter(
      (d) => d.code === "missing-asset",
    );
    assert.equal(fatal.length, 0);
  });

  test("missing-asset is fatal for image target too", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "", assetId: undefined })]),
    ]);
    const result = runExportPreflight(deck, { target: "image" });
    assert.ok(result.hasFatal);
    assert.equal(fatalDiagnostics(result)[0].code, "missing-asset");
  });
});

// ---------------------------------------------------------------------------
// Tests: raster-fallback (pptx warning)
// ---------------------------------------------------------------------------

describe("raster-fallback diagnostics", () => {
  test("image with fitMode 'none' emits raster-fallback warning in pptx", () => {
    const deck = makeDeck([makeSlide([imageEl({ fitMode: "none" })])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(!result.hasFatal);
    assert.ok(result.hasWarnings);
    assert.ok(codesOf(result).includes("raster-fallback"));
    const w = warningDiagnostics(result).find(
      (d) => d.code === "raster-fallback",
    );
    assert.ok(w);
    assert.equal(w?.severity, "warning");
    assert.equal(w?.slideIndex, 0);
  });

  test("image with non-none maskShape emits raster-fallback warning", () => {
    const deck = makeDeck([makeSlide([imageEl({ maskShape: "circle" })])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(codesOf(result).includes("raster-fallback"));
  });

  test("image with crop emits raster-fallback warning", () => {
    const deck = makeDeck([
      makeSlide([
        imageEl({ crop: { top: 0.1, right: 0, bottom: 0, left: 0 } }),
      ]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(codesOf(result).includes("raster-fallback"));
  });

  test("raster-fallback is NOT emitted for image target", () => {
    const deck = makeDeck([makeSlide([imageEl({ fitMode: "none" })])]);
    const result = runExportPreflight(deck, { target: "image" });
    assert.ok(!codesOf(result).includes("raster-fallback"));
  });

  test("image with fitMode 'cover' does NOT emit raster-fallback", () => {
    const deck = makeDeck([makeSlide([imageEl({ fitMode: "cover" })])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(!codesOf(result).includes("raster-fallback"));
  });
});

// ---------------------------------------------------------------------------
// Tests: remote-image-failure (pptx warning)
// ---------------------------------------------------------------------------

describe("remote-image-failure diagnostics", () => {
  test("http image URL emits remote-image-failure warning in pptx", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "http://example.com/img.png" })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(codesOf(result).includes("remote-image-failure"));
    const w = warningDiagnostics(result).find(
      (d) => d.code === "remote-image-failure",
    );
    assert.equal(w?.severity, "warning");
    assert.ok(w?.detail?.includes("http://example.com"));
  });

  test("https image URL emits remote-image-failure warning in pptx", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "https://cdn.example.com/photo.jpg" })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(codesOf(result).includes("remote-image-failure"));
  });

  test("data URL does NOT emit remote-image-failure", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "data:image/png;base64,abc" })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(!codesOf(result).includes("remote-image-failure"));
  });

  test("remote-image-failure is NOT emitted for image target", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "https://example.com/img.png" })]),
    ]);
    const result = runExportPreflight(deck, { target: "image" });
    assert.ok(!codesOf(result).includes("remote-image-failure"));
  });
});

// ---------------------------------------------------------------------------
// Tests: missing-font (pptx warning)
// ---------------------------------------------------------------------------

describe("missing-font diagnostics", () => {
  test("text element with custom font emits missing-font warning in pptx", () => {
    const el = textEl({
      style: {
        fontFamily: "'AcmeBrand', sans-serif",
        fontSize: 5,
        bold: false,
        italic: false,
        align: "left",
      },
    });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, {
      target: "pptx",
      customFontFamilies: new Set(["AcmeBrand"]),
    });
    assert.ok(codesOf(result).includes("missing-font"));
    const w = warningDiagnostics(result).find((d) => d.code === "missing-font");
    assert.equal(w?.severity, "warning");
    assert.equal(w?.detail, "AcmeBrand");
    assert.equal(w?.slideIndex, 0);
  });

  test("bullets element with custom font emits missing-font warning", () => {
    const el = bulletsEl({
      style: {
        fontFamily: "'BrandFont', sans-serif",
        fontSize: 4,
        bold: false,
        italic: false,
        align: "left",
      },
    });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, {
      target: "pptx",
      customFontFamilies: new Set(["BrandFont"]),
    });
    assert.ok(codesOf(result).includes("missing-font"));
  });

  test("element with system font does NOT emit missing-font", () => {
    const el = textEl({
      style: {
        fontFamily: "'Inter', sans-serif",
        fontSize: 5,
        bold: false,
        italic: false,
        align: "left",
      },
    });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, {
      target: "pptx",
      customFontFamilies: new Set(["AcmeBrand"]),
    });
    assert.ok(!codesOf(result).includes("missing-font"));
  });

  test("missing-font is NOT emitted when customFontFamilies is empty", () => {
    const el = textEl({
      style: {
        fontFamily: "'AcmeBrand', sans-serif",
        fontSize: 5,
        bold: false,
        italic: false,
        align: "left",
      },
    });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, {
      target: "pptx",
      customFontFamilies: new Set(),
    });
    assert.ok(!codesOf(result).includes("missing-font"));
  });

  test("missing-font is NOT emitted for image target", () => {
    const el = textEl({
      style: {
        fontFamily: "'AcmeBrand', sans-serif",
        fontSize: 5,
        bold: false,
        italic: false,
        align: "left",
      },
    });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, {
      target: "image",
      customFontFamilies: new Set(["AcmeBrand"]),
    });
    assert.ok(!codesOf(result).includes("missing-font"));
  });

  test("missing-font is NOT emitted when customFontFamilies is absent", () => {
    const el = textEl({
      style: {
        fontFamily: "'AcmeBrand', sans-serif",
        fontSize: 5,
        bold: false,
        italic: false,
        align: "left",
      },
    });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(!codesOf(result).includes("missing-font"));
  });
});

// ---------------------------------------------------------------------------
// Tests: unsupported-pptx-feature
// ---------------------------------------------------------------------------

describe("unsupported-pptx-feature diagnostics", () => {
  test("elbow connector emits unsupported-pptx-feature warning", () => {
    const el = connectorEl({ routing: "elbow" });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(codesOf(result).includes("unsupported-pptx-feature"));
    const w = warningDiagnostics(result).find(
      (d) =>
        d.code === "unsupported-pptx-feature" && d.detail === "connector-elbow",
    );
    assert.ok(w);
    assert.equal(w?.elementId, "con-1");
  });

  test("straight connector does NOT emit unsupported-pptx-feature", () => {
    const el = connectorEl({ routing: "straight" });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const elbowWarnings = warningDiagnostics(result).filter(
      (d) =>
        d.code === "unsupported-pptx-feature" && d.detail === "connector-elbow",
    );
    assert.equal(elbowWarnings.length, 0);
  });

  test("slide with backgroundGradient emits unsupported-pptx-feature warning", () => {
    const slide = makeSlide([], {
      backgroundGradient: { from: "#ff0000", to: "#0000ff", angle: 45 },
    });
    const deck = makeDeck([slide]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const w = warningDiagnostics(result).find(
      (d) =>
        d.code === "unsupported-pptx-feature" &&
        d.detail === "background-gradient",
    );
    assert.ok(w, "should emit background-gradient warning");
    assert.equal(w?.slideIndex, 0);
  });

  test("shadow-only elements do not emit generic future fidelity warnings", () => {
    const el = textEl({ shadow: true });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(!codesOf(result).includes("unsupported-pptx-feature"));
  });

  test("unsupported-pptx-feature is NOT emitted for image target", () => {
    const el = connectorEl({ routing: "elbow" });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, { target: "image" });
    assert.ok(!codesOf(result).includes("unsupported-pptx-feature"));
  });
});

// ---------------------------------------------------------------------------
// Tests: oversized-deck
// ---------------------------------------------------------------------------

describe("oversized-deck diagnostics", () => {
  test("deck within default limit has no oversized-deck warning", () => {
    const slides = Array.from({ length: DEFAULT_MAX_SLIDES }, (_, i) =>
      makeSlide([], { id: `s${i}`, index: i }),
    );
    const deck = makeDeck(slides);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(!codesOf(result).includes("oversized-deck"));
  });

  test("deck exceeding default limit emits oversized-deck warning", () => {
    const slides = Array.from({ length: DEFAULT_MAX_SLIDES + 1 }, (_, i) =>
      makeSlide([], { id: `s${i}`, index: i }),
    );
    const deck = makeDeck(slides);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.ok(codesOf(result).includes("oversized-deck"));
    const w = warningDiagnostics(result).find(
      (d) => d.code === "oversized-deck",
    );
    assert.equal(w?.severity, "warning");
    assert.ok(w?.message.includes(String(DEFAULT_MAX_SLIDES + 1)));
  });

  test("custom maxSlides threshold is honoured", () => {
    const slides = Array.from({ length: 6 }, (_, i) =>
      makeSlide([], { id: `s${i}`, index: i }),
    );
    const deck = makeDeck(slides);
    const result = runExportPreflight(deck, { target: "pptx", maxSlides: 5 });
    assert.ok(codesOf(result).includes("oversized-deck"));
  });

  test("oversized-deck is also emitted for image target", () => {
    const slides = Array.from({ length: DEFAULT_MAX_SLIDES + 2 }, (_, i) =>
      makeSlide([], { id: `s${i}`, index: i }),
    );
    const deck = makeDeck(slides);
    const result = runExportPreflight(deck, { target: "image" });
    assert.ok(codesOf(result).includes("oversized-deck"));
  });
});

// ---------------------------------------------------------------------------
// Tests: result flags and helpers
// ---------------------------------------------------------------------------

describe("PreflightResult flags", () => {
  test("clean deck has no diagnostics and canExport is true", () => {
    const deck = makeDeck([makeSlide([imageEl()])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.equal(result.hasFatal, false);
    assert.equal(result.canExport, true);
  });

  test("hasFatal=true means canExport=false", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ src: "", assetId: undefined })]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.equal(result.hasFatal, true);
    assert.equal(result.canExport, false);
  });

  test("warnings-only deck has hasFatal=false and canExport=true", () => {
    const deck = makeDeck([makeSlide([imageEl({ fitMode: "none" })])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.equal(result.hasFatal, false);
    assert.equal(result.hasWarnings, true);
    assert.equal(result.canExport, true);
  });

  test("fatalDiagnostics helper filters correctly", () => {
    const deck = makeDeck([
      makeSlide([
        imageEl({ src: "", assetId: undefined }),
        imageEl({ id: "img-2", fitMode: "none" }),
      ]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const fatal = fatalDiagnostics(result);
    assert.ok(fatal.every((d) => d.severity === "fatal"));
    assert.equal(fatal.length, 1);
  });

  test("warningDiagnostics helper filters correctly", () => {
    const deck = makeDeck([makeSlide([imageEl({ fitMode: "none" })])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const warnings = warningDiagnostics(result);
    assert.ok(warnings.every((d) => d.severity === "warning"));
    assert.ok(warnings.length >= 1);
  });

  test("empty deck produces no diagnostics", () => {
    const deck = makeDeck([]);
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.hasFatal, false);
    assert.equal(result.hasWarnings, false);
    assert.equal(result.canExport, true);
  });
});

// ---------------------------------------------------------------------------
// Tests: multi-slide deck accumulates diagnostics
// ---------------------------------------------------------------------------

describe("multi-slide preflight", () => {
  test("diagnostics carry correct slideIndex for each slide", () => {
    const deck = makeDeck([
      makeSlide([imageEl({ id: "img-ok", src: "data:image/png;base64,abc" })], {
        id: "s1",
        index: 0,
      }),
      makeSlide([imageEl({ id: "img-bad", src: "", assetId: undefined })], {
        id: "s2",
        index: 1,
      }),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const fatal = fatalDiagnostics(result);
    assert.equal(fatal.length, 1);
    assert.equal(fatal[0].slideIndex, 1);
    assert.equal(fatal[0].elementId, "img-bad");
  });

  test("deck with both missing asset and raster-fallback produces both codes", () => {
    const deck = makeDeck([
      makeSlide([
        imageEl({ id: "missing", src: "", assetId: undefined }),
        imageEl({ id: "raster", fitMode: "none" }),
      ]),
    ]);
    const result = runExportPreflight(deck, { target: "pptx" });
    const codes = codesOf(result);
    assert.ok(codes.includes("missing-asset"), "should have missing-asset");
    assert.ok(codes.includes("raster-fallback"), "should have raster-fallback");
  });

  test("hidden elements are excluded from preflight checks", () => {
    const el = imageEl({ src: "", assetId: undefined, hidden: true });
    const deck = makeDeck([makeSlide([el])]);
    const result = runExportPreflight(deck, { target: "pptx" });
    // Hidden element should not generate a missing-asset fatal
    assert.equal(fatalDiagnostics(result).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: custom deck-template fonts (#617)
// ---------------------------------------------------------------------------

describe("custom deck-template font diagnostics", () => {
  function brandTokenSet(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: "brand:acme",
      name: "Acme",
      colors: {
        slideBg: "#ffffff",
        surface: "#f0f0f0",
        accent: "#ff0000",
        onBg: "#000000",
        onSurface: "#111111",
        onAccent: "#ffffff",
        muted: "#888888",
      },
      typography: {
        fontFamily: "Brandon Grotesque, Arial, sans-serif",
        scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
      },
      spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
      shape: { cornerRadiusPt: 4, shadowCss: "none" },
      defaultBackground: { type: "solid", color: "#ffffff" },
      ...overrides,
    };
  }

  test("custom template font triggers a deck-level missing-font warning for PPTX", () => {
    const deck = makeDeck([makeSlide([textEl()])], {
      customTokenSet: brandTokenSet() as never,
    });
    const result = runExportPreflight(deck, {
      target: "pptx",
      customFontFamilies: new Set(["Brandon Grotesque"]),
    });
    const fontDiags = result.diagnostics.filter(
      (d) => d.code === "missing-font",
    );
    assert.equal(fontDiags.length, 1);
    assert.equal(fontDiags[0].detail, "Brandon Grotesque");
    assert.equal(fontDiags[0].slideIndex, undefined); // deck-level
    assert.equal(result.canExport, true); // warning, not fatal
  });

  test("heading and role template fonts are each reported once", () => {
    const deck = makeDeck([makeSlide([textEl()])], {
      customTokenSet: brandTokenSet({
        typography: {
          fontFamily: "Brandon Grotesque, Arial, sans-serif",
          headingFontFamily: "Tungsten, Arial, sans-serif",
          scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
          roles: {
            caption: {
              fontFamily: "Tungsten",
              fontSize: 12,
              color: "#333333",
              weight: 400,
            },
          },
        },
      }) as never,
    });
    const result = runExportPreflight(deck, {
      target: "pptx",
      customFontFamilies: new Set(["Brandon Grotesque", "Tungsten"]),
    });
    const fonts = result.diagnostics
      .filter((d) => d.code === "missing-font")
      .map((d) => d.detail)
      .sort();
    assert.deepEqual(fonts, ["Brandon Grotesque", "Tungsten"]);
  });

  test("no warning when customFontFamilies is not provided", () => {
    const deck = makeDeck([makeSlide([textEl()])], {
      customTokenSet: brandTokenSet() as never,
    });
    const result = runExportPreflight(deck, { target: "pptx" });
    assert.equal(
      result.diagnostics.filter((d) => d.code === "missing-font").length,
      0,
    );
  });

  test("no template-font warning for image-target export", () => {
    const deck = makeDeck([makeSlide([textEl()])], {
      customTokenSet: brandTokenSet() as never,
    });
    const result = runExportPreflight(deck, {
      target: "image",
      customFontFamilies: new Set(["Brandon Grotesque"]),
    });
    assert.equal(
      result.diagnostics.filter((d) => d.code === "missing-font").length,
      0,
    );
  });
});
