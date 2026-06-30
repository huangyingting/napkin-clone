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
    notes: "",
    elements: [],
  });
}

function buildCommandDeck(slideIds: string[]): Deck {
  return buildDeck({
    design: { themeId: "default" },
    slides: slideIds.map((id, i) => buildCommandSlide(id, i, `Slide ${i}`)),
  });
}

function designOverrides(slide: unknown): any {
  return (slide as any).designOverrides;
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
  assert.deepEqual(designOverrides(result.deck.slides[0]!).background, {
    type: "solid",
    color: { value: "#ff0000" },
  });
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.equal(result.patches[0]!.op, "slide.set_background");
  assert.deepEqual(
    (result.patches[0]!.slideFields?.["s1"] as any).designOverrides.background,
    {
      type: "solid",
      color: { value: "#ff0000" },
    },
  );
});

test("SET_SLIDE_BACKGROUND clears background with undefined", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
        designOverrides: {
          background: { type: "solid", color: { value: "#aabbcc" } },
        },
      } as any,
    ],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "s1",
    background: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(designOverrides(result.deck.slides[0]!), undefined);
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
  assert.deepEqual(designOverrides(result.deck.slides[0]!).background, {
    type: "gradient",
    from: { value: gradient.from },
    to: { value: gradient.to },
    angle: gradient.angle,
  });
  assert.equal(result.patches[0]!.op, "slide.set_background_gradient");
});

test("SET_SLIDE_BACKGROUND_GRADIENT supports omitted angle and clearing", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
        designOverrides: {
          background: {
            type: "gradient",
            from: { value: "#111111" },
            to: { value: "#222222" },
            angle: 30,
          },
        },
      } as any,
    ],
  };

  const withoutAngle = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_GRADIENT",
    slideId: "s1",
    gradient: { from: "#000000", to: "#ffffff" },
  });
  assert.equal(withoutAngle.ok, true);
  assert.deepEqual(designOverrides(withoutAngle.deck.slides[0]!).background, {
    type: "gradient",
    from: { value: "#000000" },
    to: { value: "#ffffff" },
  });

  const cleared = executeCommand(withoutAngle.deck, {
    type: "SET_SLIDE_BACKGROUND_GRADIENT",
    slideId: "s1",
    gradient: undefined,
  });
  assert.equal(cleared.ok, true);
  assert.equal(designOverrides(cleared.deck.slides[0]!), undefined);
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
  assert.deepEqual(designOverrides(result.deck.slides[0]!).background, {
    type: "image",
    url: "https://example.com/bg.jpg",
  });
  assert.equal(result.patches[0]!.op, "slide.set_background_image");
});

test("SET_SLIDE_BACKGROUND_IMAGE clears image backgrounds", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
        designOverrides: {
          background: { type: "image", url: "https://example.com/old.jpg" },
        },
      } as any,
    ],
  };

  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_IMAGE",
    slideId: "s1",
    image: undefined,
  });

  assert.equal(result.ok, true);
  assert.equal(designOverrides(result.deck.slides[0]!), undefined);
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
  assert.deepEqual(designOverrides(result.deck.slides[0]!).background, {
    type: "image",
    url: opts.url,
    assetId: opts.assetId,
  });
  assert.equal(result.patches[0]!.op, "slide.set_background_asset");
  assert.deepEqual(
    (result.patches[0]!.slideFields?.["s1"] as any).designOverrides.background,
    {
      type: "image",
      url: opts.url,
      assetId: opts.assetId,
    },
  );
});

test("SET_SLIDE_BACKGROUND_ASSET fails for missing slide", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_ASSET",
    slideId: "missing",
    opts: { url: "https://cdn.example.com/bg.jpg", assetId: "asset-bg" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("SET_SLIDE_BACKGROUND_ASSET clears asset with undefined", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
        designOverrides: {
          background: {
            type: "image",
            url: "https://cdn.example.com/old.jpg",
            assetId: "old123",
          },
        },
      } as any,
    ],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_ASSET",
    slideId: "s1",
    opts: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(designOverrides(result.deck.slides[0]!), undefined);
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
  assert.deepEqual(designOverrides(result.deck.slides[0]!).accent, {
    value: "#00ff00",
  });
  assert.equal(result.patches[0]!.op, "slide.set_accent");
  assert.deepEqual(
    (result.patches[0]!.slideFields?.["s1"] as any).designOverrides.accent,
    {
      value: "#00ff00",
    },
  );
});

test("SET_SLIDE_ACCENT clears accent with undefined", () => {
  const deck: Deck = {
    design: { themeId: "default" },
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
        designOverrides: { accent: { value: "#ff0000" } },
      } as any,
    ],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_ACCENT",
    slideId: "s1",
    accent: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(designOverrides(result.deck.slides[0]!), undefined);
});
