import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import { executeCommand } from "./slide-commands";
import { buildDeck, buildSlide } from "@/test/builders/deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildCommandSlide(id: string, index: number, title = ""): Slide {
  return buildSlide({
    id,
    index,
    title,
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements: [],
  });
}

function buildCommandDeck(slideIds: string[]): Deck {
  return buildDeck({
    themeId: "default",
    slides: slideIds.map((id, i) => buildCommandSlide(id, i, `Slide ${i}`)),
  });
}

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND sets background color and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "s1",
    background: "#ff0000",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.background, "#ff0000");
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.equal(result.patches[0]!.op, "slide.set_background");
  assert.equal(result.patches[0]!.slideFields?.["s1"]?.background, "#ff0000");
});

test("SET_SLIDE_BACKGROUND clears background with undefined", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [{ ...buildCommandDeck(["s1"]).slides[0]!, background: "#aabbcc" }],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "s1",
    background: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.background, undefined);
});

test("SET_SLIDE_BACKGROUND fails for missing slide", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "missing",
    background: "#ff0000",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND_GRADIENT
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND_GRADIENT sets gradient and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const gradient = { from: "#ff0000", to: "#0000ff", angle: 45 };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_GRADIENT",
    slideId: "s1",
    gradient,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.deck.slides[0]!.backgroundGradient, gradient);
  assert.equal(result.patches[0]!.op, "slide.set_background_gradient");
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND_IMAGE
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND_IMAGE sets image URL and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_IMAGE",
    slideId: "s1",
    image: "https://example.com/bg.jpg",
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.deck.slides[0]!.backgroundImage,
    "https://example.com/bg.jpg",
  );
  assert.equal(result.patches[0]!.op, "slide.set_background_image");
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND_ASSET (epic #374 asset layer)
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND_ASSET sets background asset and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const opts = {
    url: "https://cdn.example.com/asset123.jpg",
    assetId: "asset123",
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_ASSET",
    slideId: "s1",
    opts,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.backgroundImage, opts.url);
  assert.equal(result.deck.slides[0]!.backgroundAssetId, opts.assetId);
  assert.equal(result.patches[0]!.op, "slide.set_background_asset");
  assert.equal(
    result.patches[0]!.slideFields?.["s1"]?.backgroundImage,
    opts.url,
  );
  assert.equal(
    result.patches[0]!.slideFields?.["s1"]?.backgroundAssetId,
    opts.assetId,
  );
});

test("SET_SLIDE_BACKGROUND_ASSET clears asset with undefined", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
        backgroundImage: "https://cdn.example.com/old.jpg",
        backgroundAssetId: "old123",
      },
    ],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_ASSET",
    slideId: "s1",
    opts: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.backgroundImage, undefined);
  assert.equal(result.deck.slides[0]!.backgroundAssetId, undefined);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_ACCENT
// ---------------------------------------------------------------------------

test("SET_SLIDE_ACCENT sets accent color and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_ACCENT",
    slideId: "s1",
    accent: "#00ff00",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.accent, "#00ff00");
  assert.equal(result.patches[0]!.op, "slide.set_accent");
  assert.equal(result.patches[0]!.slideFields?.["s1"]?.accent, "#00ff00");
});

test("SET_SLIDE_ACCENT clears accent with undefined", () => {
  const deck: Deck = {
    themeId: "default",
    slides: [{ ...buildCommandDeck(["s1"]).slides[0]!, accent: "#ff0000" }],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_ACCENT",
    slideId: "s1",
    accent: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.accent, undefined);
});
