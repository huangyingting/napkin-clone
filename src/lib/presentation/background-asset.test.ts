/**
 * Tests for backgroundAssetId support in deck schema (issue #393).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import type { Deck } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck-migration";

function minSlide(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    index: 0,
    title: "Slide",
    notes: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    theme: "default",
    elements: [],
    ...overrides,
  };
}

function deckWith(slides: object[]): unknown {
  return { slides, theme: "default", schemaVersion: CURRENT_DECK_SCHEMA_VERSION };
}

function minDeck(slideOverrides: Record<string, unknown> = {}): Deck {
  return {
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide",
        notes: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        theme: "default",
        elements: [],
        ...slideOverrides,
      },
    ],
    theme: "default",
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}

test("#393: safeParseDeck round-trips backgroundAssetId on a slide", () => {
  const input = deckWith([
    minSlide({
      backgroundImage: "/slide-assets/doc1/abc123.png",
      backgroundAssetId: "asset-id-1",
    }),
  ]);
  const result = safeParseDeck(input);
  assert.ok(result.success);
  assert.equal(result.data.slides[0].backgroundAssetId, "asset-id-1");
  assert.equal(
    result.data.slides[0].backgroundImage,
    "/slide-assets/doc1/abc123.png",
  );
});

test("#393: safeParseDeck accepts slide without backgroundAssetId", () => {
  const input = deckWith([minSlide({ backgroundImage: "/img.png" })]);
  const result = safeParseDeck(input);
  assert.ok(result.success);
  assert.equal(result.data.slides[0].backgroundAssetId, undefined);
});

test("#393: safeParseDeck rejects backgroundAssetId that is not a string", () => {
  const input = deckWith([minSlide({ backgroundAssetId: 42 })]);
  const result = safeParseDeck(input);
  assert.ok(!result.success);
  assert.ok(result.error.includes("backgroundAssetId"));
});

test("#393: safeParseDeck rejects empty-string backgroundAssetId", () => {
  const input = deckWith([minSlide({ backgroundAssetId: "" })]);
  const result = safeParseDeck(input);
  assert.ok(!result.success);
  assert.ok(result.error.includes("backgroundAssetId"));
});

test("#393: setSlideBackgroundAsset persists both url and assetId on slide", async () => {
  const { setSlideBackgroundAsset } = await import("./deck-mutations");

  const base = minDeck();
  const updated = setSlideBackgroundAsset(base, 0, {
    url: "/slide-assets/doc1/abc.png",
    assetId: "asset-xyz",
  });
  assert.equal(updated.slides[0].backgroundImage, "/slide-assets/doc1/abc.png");
  assert.equal(updated.slides[0].backgroundAssetId, "asset-xyz");
  assert.equal(updated.slides[0].backgroundGradient, undefined);

  // Round-trips through schema validation
  const parsed = safeParseDeck(updated);
  assert.ok(parsed.success);
  assert.equal(parsed.data.slides[0].backgroundAssetId, "asset-xyz");
});

test("#393: setSlideBackgroundAsset clears both fields when called with undefined", async () => {
  const { setSlideBackgroundAsset } = await import("./deck-mutations");

  const base = minDeck({
    backgroundImage: "/slide-assets/doc1/abc.png",
    backgroundAssetId: "asset-xyz",
  });
  const updated = setSlideBackgroundAsset(base, 0, undefined);
  assert.equal(updated.slides[0].backgroundImage, undefined);
  assert.equal(updated.slides[0].backgroundAssetId, undefined);
});
