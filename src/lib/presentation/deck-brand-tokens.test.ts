/**
 * Tests for deck-brand-tokens.ts — brandToTokenSet, brandToMasterChrome, applyBrandToDeck.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrandStyle } from "@/lib/brand/schema";
import type { Deck } from "./deck";
import {
  applyBrandToDeck,
  brandToMasterChrome,
  brandToTokenSet,
} from "./brand-presentation-theme-adapter";
import { DEFAULT_TOKEN_SET } from "./presentation-theme";

function mockBrand(overrides: Partial<BrandStyle> = {}): BrandStyle {
  return {
    id: "brand-1",
    name: "Acme Brand",
    ownerId: "user-1",
    palette: ["#ff0000", "#00ff00"],
    background: "#fafafa",
    nodeFill: "#ff0000",
    nodeStroke: "#cc0000",
    nodeText: "#ffffff",
    edgeColor: "#888888",
    fontFamily: "Helvetica Neue",
    fontAssetUrl: null,
    logoAssetUrl: "https://example.com/logo.png",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function baseDeck(): Deck {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide 1",
        notes: "",
        elements: [],
      },
    ],
  };
}

test("brandToTokenSet creates a token set with brand id", () => {
  const brand = mockBrand();
  const ts = brandToTokenSet(brand);
  assert.equal(ts.id, "brand:brand-1");
  assert.equal(ts.name, "Acme Brand");
});

test("brandToTokenSet uses nodeFill as accent", () => {
  const brand = mockBrand({ nodeFill: "#aabbcc" });
  const ts = brandToTokenSet(brand);
  assert.equal(ts.colors.accent, "#aabbcc");
});

test("brandToTokenSet falls back to palette[0] when nodeFill is null", () => {
  const brand = mockBrand({ nodeFill: null, palette: ["#112233"] });
  const ts = brandToTokenSet(brand);
  assert.equal(ts.colors.accent, "#112233");
});

test("brandToTokenSet falls back to default accent when nodeFill and palette are null", () => {
  const brand = mockBrand({ nodeFill: null, palette: null });
  const ts = brandToTokenSet(brand);
  assert.equal(ts.colors.accent, DEFAULT_TOKEN_SET.colors.accent);
});

test("brandToTokenSet uses brand background as slideBg", () => {
  const brand = mockBrand({ background: "#123456" });
  const ts = brandToTokenSet(brand);
  assert.equal(ts.colors.slideBg, "#123456");
  assert.deepEqual(ts.defaultBackground, { type: "solid", color: "#123456" });
});

test("brandToTokenSet falls back to default slideBg when background is null", () => {
  const brand = mockBrand({ background: null });
  const ts = brandToTokenSet(brand);
  assert.equal(ts.colors.slideBg, DEFAULT_TOKEN_SET.colors.slideBg);
});

test("brandToTokenSet uses brand fontFamily", () => {
  const brand = mockBrand({ fontFamily: "Comic Sans MS" });
  const ts = brandToTokenSet(brand);
  assert.equal(ts.typography.fontFamily, "Comic Sans MS");
});

test("brandToTokenSet falls back to default fontFamily when null", () => {
  const brand = mockBrand({ fontFamily: null });
  const ts = brandToTokenSet(brand);
  assert.equal(
    ts.typography.fontFamily,
    DEFAULT_TOKEN_SET.typography.fontFamily,
  );
});

test("brandToMasterChrome creates master with brand id prefix", () => {
  const brand = mockBrand();
  const master = brandToMasterChrome(brand, "brand:brand-1");
  assert.equal(master.id, "master:brand-1");
  assert.equal(master.name, "Acme Brand Master");
  assert.deepEqual(master.elements, []);
  assert.deepEqual(master.background, {
    type: "solid",
    color: { value: "#fafafa" },
  });
});

test("brandToMasterChrome includes deck logoUrl when logoAssetUrl is set", () => {
  const brand = mockBrand({ logoAssetUrl: "https://example.com/logo.png" });
  const master = brandToMasterChrome(brand, "brand:brand-1");
  assert.equal(master.logoUrl, "https://example.com/logo.png");
  assert.equal(master.logoPlacement, "top-right");
});

test("brandToMasterChrome omits logo fields when logoAssetUrl is null", () => {
  const brand = mockBrand({ logoAssetUrl: null });
  const master = brandToMasterChrome(brand, "brand:brand-1");
  assert.equal(master.logoUrl, undefined);
  assert.equal(master.logoPlacement, undefined);
});

test("applyBrandToDeck sets design theme and theme override token set on deck", () => {
  const deck = baseDeck();
  const brand = mockBrand();
  const newDeck = applyBrandToDeck(deck, brand);
  assert.equal(newDeck.design?.themeId, "brand:brand-1");
  const tokenSet = (newDeck.design?.themeOverrides?.tokenSet ?? {}) as {
    id?: string;
  };
  assert.equal(tokenSet.id, "brand:brand-1");
});

test("applyBrandToDeck adds brand master as first master", () => {
  const deck = baseDeck();
  const brand = mockBrand();
  const newDeck = applyBrandToDeck(deck, brand);
  assert.ok(newDeck.masters !== undefined);
  assert.equal(newDeck.masters?.[0].id, "master:brand-1");
});

test("applyBrandToDeck preserves existing masters after brand master", () => {
  const deck: Deck = {
    ...baseDeck(),
    masters: [
      {
        id: "existing-master",
        name: "Existing",
        elements: [],
      },
    ],
  };
  const brand = mockBrand();
  const newDeck = applyBrandToDeck(deck, brand);
  assert.equal(newDeck.masters?.length, 2);
  assert.equal(newDeck.masters?.[0].id, "master:brand-1");
  assert.equal(newDeck.masters?.[1].id, "existing-master");
});

test("applyBrandToDeck replaces existing brand master when reapplied", () => {
  const deck = baseDeck();
  const brand = mockBrand();
  const firstApply = applyBrandToDeck(deck, brand);
  const secondApply = applyBrandToDeck(firstApply, brand);
  // Should not duplicate
  assert.equal(
    secondApply.masters?.filter((m) => m.id === "master:brand-1").length,
    1,
  );
});

test("applyBrandToDeck does not mutate original deck", () => {
  const deck = baseDeck();
  const brand = mockBrand();
  applyBrandToDeck(deck, brand);
  assert.equal(deck.design?.themeId, "default");
  assert.equal(deck.design?.themeOverrides, undefined);
  assert.equal(deck.masters?.length, 1);
  assert.equal(deck.masters?.[0]?.id, "master-default");
});
