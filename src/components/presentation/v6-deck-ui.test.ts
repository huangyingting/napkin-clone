import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "@/lib/presentation/deck";

import {
  deckCanvasFormat,
  deckHasThemeOverrides,
  deckPresentationThemeId,
  slideAccentValue,
  slideBackgroundGradientValue,
  slideBackgroundImageValue,
  slideDesignOverrides,
  slideSolidBackgroundValue,
} from "./v6-deck-ui";

function deck(overrides: Record<string, unknown> = {}): Deck {
  return { slides: [], ...overrides } as unknown as Deck;
}

function slide(overrides: Record<string, unknown> = {}): Slide {
  return {
    id: "slide-1",
    index: 0,
    title: "Slide",
    bullets: [],
    notes: "",
    ...overrides,
  } as unknown as Slide;
}

test("deck helpers read current canvas format, theme id, and overrides", () => {
  assert.equal(deckCanvasFormat(deck({ canvas: { format: "4:3" } })), "4:3");
  assert.equal(deckCanvasFormat(deck({ canvas: null })), "16:9");
  assert.equal(
    deckPresentationThemeId(deck({ design: { themeId: "branded" } })),
    "branded",
  );
  assert.equal(deckPresentationThemeId(deck({ design: null })), "default");
  assert.equal(
    deckHasThemeOverrides(
      deck({ design: { themeOverrides: { colors: { accent: "#f00" } } } }),
    ),
    true,
  );
  assert.equal(
    deckHasThemeOverrides(deck({ design: { themeOverrides: null } })),
    false,
  );
});

test("slide background helpers return solid, gradient, image, and accent values", () => {
  assert.equal(
    slideSolidBackgroundValue(
      slide({
        designOverrides: {
          background: { type: "solid", color: { value: "#fff" } },
        },
      }),
    ),
    "#fff",
  );
  assert.deepEqual(
    slideBackgroundGradientValue(
      slide({
        designOverrides: {
          background: {
            type: "gradient",
            from: "#111",
            to: { value: "#222" },
            angle: 45,
          },
        },
      }),
    ),
    { from: "#111", to: "#222", angle: 45 },
  );
  assert.equal(
    slideBackgroundImageValue(
      slide({
        designOverrides: { background: { type: "image", url: "/hero.png" } },
      }),
    ),
    "/hero.png",
  );
  assert.equal(
    slideAccentValue(slide({ designOverrides: { accent: "#0af" } })),
    "#0af",
  );
});

test("slide background helpers ignore incomplete or mismatched overrides", () => {
  const emptySlide = slide({ designOverrides: null });
  assert.deepEqual(slideDesignOverrides(emptySlide), {});
  assert.equal(slideSolidBackgroundValue(emptySlide), undefined);
  assert.equal(
    slideBackgroundGradientValue(
      slide({
        designOverrides: {
          background: { type: "gradient", from: "#111", to: null },
        },
      }),
    ),
    undefined,
  );
  assert.deepEqual(
    slideBackgroundGradientValue(
      slide({
        designOverrides: {
          background: { type: "gradient", from: "#111", to: "#222" },
        },
      }),
    ),
    { from: "#111", to: "#222" },
  );
  assert.equal(
    slideBackgroundImageValue(
      slide({ designOverrides: { background: { type: "image", url: 42 } } }),
    ),
    undefined,
  );
  assert.equal(
    slideAccentValue(slide({ designOverrides: { accent: {} } })),
    undefined,
  );
});
