/**
 * Tests for backgroundAssetId support in deck schema (issue #393).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import type { Deck } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";

function minSlide(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    index: 0,
    title: "Slide",
    notes: "",
    elements: [],
    ...overrides,
  };
}

function deckWith(slides: object[]): unknown {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides,
  };
}

function minDeck(slideOverrides: Record<string, unknown> = {}): Deck {
  return {
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide",
        notes: "",
        elements: [],
        ...slideOverrides,
      },
    ],
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
  } as unknown as Deck;
}

function slideBackground(slide: unknown): any {
  return (slide as any).designOverrides?.background;
}

test("#393: safeParseDeck round-trips backgroundAssetId on a slide", () => {
  const input = deckWith([
    minSlide({
      designOverrides: {
        background: {
          type: "image",
          url: "/slide-assets/doc1/abc123.png",
          assetId: "asset-id-1",
        },
      },
    }),
  ]);
  const result = safeParseDeck(input);
  assert.ok(result.success);
  assert.equal(slideBackground(result.data.slides[0]).assetId, "asset-id-1");
  assert.equal(
    slideBackground(result.data.slides[0]).url,
    "/slide-assets/doc1/abc123.png",
  );
});

test("#393: safeParseDeck accepts slide without backgroundAssetId", () => {
  const input = deckWith([
    minSlide({
      designOverrides: { background: { type: "image", url: "/img.png" } },
    }),
  ]);
  const result = safeParseDeck(input);
  assert.ok(result.success);
  assert.equal(slideBackground(result.data.slides[0]).assetId, undefined);
});

test("#393: safeParseDeck rejects backgroundAssetId that is not a string", () => {
  const input = deckWith([
    minSlide({
      designOverrides: {
        background: { type: "image", url: "/img.png", assetId: 42 },
      },
    }),
  ]);
  const result = safeParseDeck(input);
  assert.ok(!result.success);
  assert.ok(result.error.includes("assetId"));
});

test("#393: safeParseDeck rejects empty-string backgroundAssetId", () => {
  const input = deckWith([
    minSlide({
      designOverrides: {
        background: { type: "image", url: "/img.png", assetId: "" },
      },
    }),
  ]);
  const result = safeParseDeck(input);
  assert.ok(!result.success);
  assert.ok(result.error.includes("assetId"));
});

test("#393: setSlideBackgroundAsset persists both url and assetId on slide", async () => {
  const { setSlideBackgroundAsset } = await import("./deck-mutations");

  const base = minDeck();
  const updated = setSlideBackgroundAsset(base, 0, {
    url: "/slide-assets/doc1/abc.png",
    assetId: "asset-xyz",
  });
  assert.deepEqual(slideBackground(updated.slides[0]), {
    type: "image",
    url: "/slide-assets/doc1/abc.png",
    assetId: "asset-xyz",
  });

  // Round-trips through schema validation
  const parsed = safeParseDeck(updated);
  assert.ok(parsed.success);
  assert.equal(slideBackground(parsed.data.slides[0]).assetId, "asset-xyz");
});

test("#393: setSlideBackgroundAsset clears both fields when called with undefined", async () => {
  const { setSlideBackgroundAsset } = await import("./deck-mutations");

  const base = minDeck({
    designOverrides: {
      background: {
        type: "image",
        url: "/slide-assets/doc1/abc.png",
        assetId: "asset-xyz",
      },
    },
  });
  const updated = setSlideBackgroundAsset(base, 0, undefined);
  assert.equal(slideBackground(updated.slides[0]), undefined);
});
