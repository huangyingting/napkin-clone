/**
 * Tests for Deck.masters and Slide.masterRef validation in deck-schema.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";

function baseDeck(overrides: Record<string, unknown> = {}) {
  return {
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide 1",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
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
  const result = safeParseDeck({
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Test",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
        masterRef: "master-1",
      },
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
  assert.equal(result.data.slides[0].masterRef, "master-1");
});

test("slide with orphan masterRef is stripped when masters is defined", () => {
  const result = safeParseDeck({
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Test",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
        masterRef: "non-existent-master",
      },
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
  const result = safeParseDeck({
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Test",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
        masterRef: "some-master",
      },
    ],
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
