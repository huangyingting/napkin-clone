/**
 * Tests for Deck.masters and Slide.masterRef validation in deck-schema.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";

function baseDeck(overrides: Record<string, unknown> = {}) {
  return {
    themeId: "default",
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide 1",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        themeId: "default",
        elements: [],
      },
    ],
    ...overrides,
  };
}

test("deck without masters parses successfully", () => {
  const result = safeParseDeck(baseDeck());
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.masters, undefined);
});

test("deck with valid masters array is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-1",
          name: "Default Master",
          themeId: "indigo",
          showPageNumbers: false,
        },
      ],
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.masters?.length, 1);
  assert.equal(result.data.masters?.[0].id, "master-1");
  assert.equal(result.data.masters?.[0].showPageNumbers, false);
});

test("master with solid background treatment is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "m1",
          name: "Master",
          themeId: "indigo",
          showPageNumbers: false,
          background: { type: "solid", color: "#ff0000" },
        },
      ],
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  const bg = result.data.masters?.[0].background;
  assert.equal(bg?.type, "solid");
  if (bg?.type === "solid") assert.equal(bg.color, "#ff0000");
});

test("master with gradient background treatment is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "m1",
          name: "Master",
          themeId: "default",
          showPageNumbers: false,
          background: {
            type: "gradient",
            from: "#111111",
            to: "#222222",
            angle: 90,
          },
        },
      ],
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  const bg = result.data.masters?.[0].background;
  assert.equal(bg?.type, "gradient");
  if (bg?.type === "gradient") {
    assert.equal(bg.from, "#111111");
    assert.equal(bg.to, "#222222");
    assert.equal(bg.angle, 90);
  }
});

test("master with image background treatment is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "m1",
          name: "Master",
          themeId: "default",
          showPageNumbers: true,
          background: { type: "image", url: "https://example.com/bg.jpg" },
        },
      ],
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  const bg = result.data.masters?.[0].background;
  assert.equal(bg?.type, "image");
  if (bg?.type === "image") assert.equal(bg.url, "https://example.com/bg.jpg");
});

test("master with logoUrl and logoPlacement is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "m1",
          name: "Brand Master",
          themeId: "default",
          showPageNumbers: false,
          logoUrl: "https://example.com/logo.png",
          logoPlacement: "top-right",
        },
      ],
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(
    result.data.masters?.[0].logoUrl,
    "https://example.com/logo.png",
  );
  assert.equal(result.data.masters?.[0].logoPlacement, "top-right");
});

test("master with footerText is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "m1",
          name: "Master",
          themeId: "default",
          showPageNumbers: false,
          footerText: "Confidential — Page {{pageNumber}}",
        },
      ],
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(
    result.data.masters?.[0].footerText,
    "Confidential — Page {{pageNumber}}",
  );
});

test("master missing id is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [{ name: "Master", themeId: "default", showPageNumbers: false }],
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /id must be a non-empty string/);
});

test("master missing name is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [{ id: "m1", themeId: "default", showPageNumbers: false }],
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /name must be a non-empty string/);
});

test("master with invalid logoPlacement is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "m1",
          name: "Master",
          themeId: "default",
          showPageNumbers: false,
          logoPlacement: "center",
        },
      ],
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /logoPlacement must be one of/);
});

test("masters must be an array", () => {
  const result = safeParseDeck(baseDeck({ masters: "not-an-array" }));
  assert.ok(!result.success);
  assert.match(result.error, /Deck\.masters must be an array/);
});

test("slide with valid masterRef is preserved", () => {
  const deck = baseDeck();
  const result = safeParseDeck({
    ...deck,
    slides: [{ ...(deck.slides as object[])[0], masterRef: "master-1" }],
    masters: [
      {
        id: "master-1",
        name: "Master 1",
        themeId: "default",
        showPageNumbers: false,
      },
    ],
  });
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.slides[0].masterRef, "master-1");
});

test("slide with orphan masterRef is stripped when masters is defined", () => {
  const deck = baseDeck();
  const result = safeParseDeck({
    ...deck,
    slides: [
      { ...(deck.slides as object[])[0], masterRef: "non-existent-master" },
    ],
    masters: [
      {
        id: "master-1",
        name: "Master 1",
        themeId: "default",
        showPageNumbers: false,
      },
    ],
  });
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.slides[0].masterRef, undefined);
});

test("slide masterRef is preserved when no masters array is present", () => {
  const deck = baseDeck();
  const result = safeParseDeck({
    ...deck,
    slides: [{ ...(deck.slides as object[])[0], masterRef: "some-master" }],
  });
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.slides[0].masterRef, "some-master");
});

test("customTokenSet with valid id and name is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: {
        id: "brand:abc",
        name: "My Brand",
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
          fontFamily: "Arial",
          scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
        },
        spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
        shape: { cornerRadiusPt: 4, shadowCss: "none" },
        defaultBackground: { type: "solid", color: "#ffffff" },
      },
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.customTokenSet?.id, "brand:abc");
  assert.equal(result.data.customTokenSet?.name, "My Brand");
});

test("customTokenSet missing id is rejected", () => {
  const result = safeParseDeck(
    baseDeck({ customTokenSet: { name: "Bad Token Set" } }),
  );
  assert.ok(!result.success);
  assert.match(
    result.error,
    /Deck\.customTokenSet\.id must be a non-empty string/,
  );
});

test("customTokenSet must be an object", () => {
  const result = safeParseDeck(baseDeck({ customTokenSet: "not-an-object" }));
  assert.ok(!result.success);
  assert.match(result.error, /Deck\.customTokenSet must be an object/);
});

// ---------------------------------------------------------------------------
// Hardened customTokenSet validation (#604)
// ---------------------------------------------------------------------------

function validTokenSet(overrides: Record<string, unknown> = {}) {
  return {
    id: "brand:abc",
    name: "My Brand",
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
      fontFamily: "Arial",
      scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
    },
    spacing: { slidePaddingPt: 36, gridUnitPt: 6 },
    shape: { cornerRadiusPt: 4, shadowCss: "none" },
    defaultBackground: { type: "solid", color: "#ffffff" },
    ...overrides,
  };
}

test("customTokenSet with an invalid color is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        colors: {
          slideBg: "not-a-color",
          surface: "#f0f0f0",
          accent: "#ff0000",
          onBg: "#000000",
          onSurface: "#111111",
          onAccent: "#ffffff",
          muted: "#888888",
        },
      }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /colors\.slideBg must be a hex color/);
});

test("customTokenSet with an invalid background is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        defaultBackground: { type: "solid", color: "nope" },
      }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /defaultBackground\.color must be a hex color/);
});

test("customTokenSet with valid semantic role tokens is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        typography: {
          fontFamily: "Arial",
          scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
          roles: {
            h1: {
              fontSize: 48,
              color: "#111827",
              weight: 700,
              align: "center",
            },
            body: { fontSize: 16, color: "#0f172a", weight: 400 },
          },
        },
      }),
    }),
  );
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.data.customTokenSet?.typography.roles?.h1?.fontSize, 48);
});

test("customTokenSet with an unknown role key is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        typography: {
          fontFamily: "Arial",
          scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
          roles: { headline: { fontSize: 48, color: "#111827", weight: 700 } },
        },
      }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /headline is not a known text role/);
});

test("customTokenSet with a role token missing color is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        typography: {
          fontFamily: "Arial",
          scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
          roles: { h1: { fontSize: 48, weight: 700 } },
        },
      }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /roles\.h1\.color must be a hex color/);
});

// ---------------------------------------------------------------------------
// Element semantic role + style override validation (#605 / #604)
// ---------------------------------------------------------------------------

function deckWithElement(element: Record<string, unknown>) {
  return baseDeck({
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide 1",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        themeId: "default",
        elements: [{ zIndex: 0, ...element }],
      },
    ],
  });
}

const baseTextStyle = {
  fontSize: 5,
  bold: false,
  italic: false,
  align: "left",
};

test("text element with valid textRole and styleOverride is accepted", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "Hi",
      role: "body",
      style: baseTextStyle,
      textRole: "h2",
      styleOverride: { color: "#ff00ff", bold: true },
    }),
  );
  assert.ok(result.success, result.success ? "" : result.error);
  if (!result.success) return;
  const el = result.data.slides[0].elements?.[0];
  assert.equal(el?.kind, "text");
  if (el?.kind !== "text") return;
  assert.equal(el.textRole, "h2");
  assert.equal(el.styleOverride?.color, "#ff00ff");
  assert.equal(el.styleOverride?.bold, true);
});

test("text element with an unknown textRole is rejected", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "Hi",
      role: "body",
      style: baseTextStyle,
      textRole: "headline",
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /textRole must be one of/);
});

test("text element with an invalid styleOverride color is rejected", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "Hi",
      role: "body",
      style: baseTextStyle,
      styleOverride: { color: "magenta" },
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /styleOverride\.color must be a hex color/);
});

test("shape element with textRole and textStyleOverride is accepted", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "shape",
      box: { x: 0, y: 0, w: 10, h: 10 },
      shape: "rect",
      color: "#3366ff",
      text: "Label",
      textRole: "shapeLabel",
      textStyleOverride: { bold: true, align: "center" },
    }),
  );
  assert.ok(result.success, result.success ? "" : result.error);
  if (!result.success) return;
  const el = result.data.slides[0].elements?.[0];
  assert.equal(el?.kind, "shape");
  if (el?.kind !== "shape") return;
  assert.equal(el.textRole, "shapeLabel");
  assert.equal(el.textStyleOverride?.bold, true);
});

// ---------------------------------------------------------------------------
// Optional non-text template tokens (#601)
// ---------------------------------------------------------------------------

test("customTokenSet with valid non-text default tokens is accepted", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        bullet: {
          markerColor: "#ff0000",
          gapPct: 2,
          numberStyle: "lower-alpha",
        },
        connector: {
          color: "#00ff00",
          width: 1.2,
          dash: "dashed",
          endArrow: "filled",
        },
        visual: { styleThemeId: "mono", transparentBackground: true },
        image: {
          fitMode: "cover",
          radiusPct: 8,
          maskShape: "circle",
          shadow: true,
        },
        shape: {
          cornerRadiusPt: 6,
          shadowCss: "none",
          fill: "#123456",
          opacity: 0.5,
        },
      }),
    }),
  );
  assert.ok(result.success, result.success ? "" : result.error);
  if (!result.success) return;
  const ts = result.data.customTokenSet;
  assert.equal(ts?.bullet?.markerColor, "#ff0000");
  assert.equal(ts?.connector?.dash, "dashed");
  assert.equal(ts?.image?.fitMode, "cover");
  assert.equal(ts?.shape?.fill, "#123456");
  assert.equal(ts?.shape?.opacity, 0.5);
});

test("customTokenSet with an invalid bullet marker color is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({ bullet: { markerColor: "red" } }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /bullet\.markerColor must be a hex color/);
});

test("customTokenSet with an invalid connector dash is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({ connector: { dash: "wavy" } }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /connector\.dash must be one of/);
});

test("customTokenSet with an invalid shape fill color is rejected", () => {
  const result = safeParseDeck(
    baseDeck({
      customTokenSet: validTokenSet({
        shape: { cornerRadiusPt: 4, shadowCss: "none", fill: "nothex" },
      }),
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /shape\.fill must be a hex color/);
});

// ---------------------------------------------------------------------------
// Semantic layout-slot binding validation (#628)
// ---------------------------------------------------------------------------

test("element with a valid layoutSlot binding is accepted", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "Title",
      role: "title",
      style: baseTextStyle,
      layoutSlot: { kind: "title" },
    }),
  );
  assert.ok(result.success, result.success ? "" : result.error);
  if (!result.success) return;
  const el = result.data.slides[0].elements?.[0];
  assert.equal(el?.layoutSlot?.kind, "title");
});

test("element with a repeated-slot index binding is accepted", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "Body col 2",
      role: "body",
      style: baseTextStyle,
      layoutSlot: { kind: "body", index: 1 },
    }),
  );
  assert.ok(result.success, result.success ? "" : result.error);
  if (!result.success) return;
  assert.equal(result.data.slides[0].elements?.[0].layoutSlot?.index, 1);
});

test("element with an unknown layoutSlot kind is rejected", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "x",
      role: "body",
      style: baseTextStyle,
      layoutSlot: { kind: "header" },
    }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /layoutSlot\.kind must be one of/);
});

test("element with a negative layoutSlot index is rejected", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "e1",
      kind: "text",
      box: { x: 0, y: 0, w: 10, h: 10 },
      text: "x",
      role: "body",
      style: baseTextStyle,
      layoutSlot: { kind: "body", index: -1 },
    }),
  );
  assert.ok(!result.success);
  assert.match(
    result.error,
    /layoutSlot\.index must be a non-negative integer/,
  );
});

// ---------------------------------------------------------------------------
// Current-shape template model round-trip + version policy (#620)
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips the full current-shape template model", () => {
  const result = safeParseDeck({
    themeId: "indigo",
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    customTokenSet: validTokenSet({
      typography: {
        fontFamily: "Inter, sans-serif",
        headingFontFamily: "Space Grotesk, sans-serif",
        scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
        roles: {
          h1: { fontSize: 42, color: "#111827", weight: 700, align: "center" },
          body: { fontSize: 16, color: "#0f172a", weight: 400 },
        },
      },
      bullet: { markerColor: "#6366f1", numberStyle: "decimal" },
      connector: { color: "#0f172a", endArrow: "filled" },
      visual: { transparentBackground: true },
      image: { fitMode: "cover", radiusPct: 6 },
      shape: { cornerRadiusPt: 6, shadowCss: "none", fill: "#eef2ff" },
    }),
    masters: [
      { id: "m1", name: "Content", themeId: "indigo", showPageNumbers: true },
    ],
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Title",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        themeId: "indigo",
        masterRef: "m1",
        elements: [
          {
            id: "t1",
            kind: "text",
            zIndex: 0,
            box: { x: 6, y: 6, w: 80, h: 16 },
            text: "Heading",
            role: "title",
            style: { fontSize: 6, bold: true, italic: false, align: "center" },
            textRole: "h1",
            styleOverride: { color: "#ffffff" },
            layoutSlot: { kind: "title" },
          },
          {
            id: "b1",
            kind: "bullets",
            zIndex: 1,
            box: { x: 6, y: 26, w: 80, h: 60 },
            bullets: ["a", "b"],
            items: [{ text: "a" }, { text: "b" }],
            style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
            textRole: "bullet",
            layoutSlot: { kind: "body" },
          },
          {
            id: "sh1",
            kind: "shape",
            zIndex: 2,
            box: { x: 60, y: 26, w: 30, h: 20 },
            shape: "rect",
            color: "#3366ff",
            text: "Label",
            textRole: "shapeLabel",
            textStyleOverride: { bold: true, align: "center" },
            layoutSlot: { kind: "caption" },
          },
        ],
      },
    ],
  });
  assert.ok(result.success, result.success ? "" : result.error);
  if (!result.success) return;
  const el = result.data.slides[0].elements ?? [];
  assert.equal(el[0].layoutSlot?.kind, "title");
  assert.equal(el[1].kind === "bullets" ? el[1].textRole : "x", "bullet");
  assert.equal(el[2].kind === "shape" ? el[2].textRole : "x", "shapeLabel");
  assert.equal(result.data.customTokenSet?.typography.roles?.h1?.fontSize, 42);
});

test("safeParseDeck rejects a superseded (non-current) schemaVersion", () => {
  const result = safeParseDeck(
    baseDeck({ schemaVersion: CURRENT_DECK_SCHEMA_VERSION - 1 }),
  );
  assert.ok(!result.success);
  assert.match(result.error, /schemaVersion .* is not supported/);
});
