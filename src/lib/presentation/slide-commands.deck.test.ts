import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import { executeCommand } from "./slide-commands";
import { resolveThemeTokens } from "./deck-theme-tokens";
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
// Issue #400 — SET_PRESENTATION_THEME
// ---------------------------------------------------------------------------

test("SET_PRESENTATION_THEME changes deck theme and emits patch with deckFields", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "SET_PRESENTATION_THEME",
    themeId: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).design.themeId, "ocean");
  assert.equal(result.patches[0]!.op, "presentation.set_theme");
  assert.equal(result.patches[0]!.deckFields?.design?.themeId, "ocean");
  // All slide ids are affected
  assert.equal(result.affectedSlideIds.length, 2);
});

test("SET_PRESENTATION_THEME clears theme overrides so built-in theme is visible", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    design: {
      themeId: "forest",
      themeOverrides: {
        tokenSet: {
          ...resolveThemeTokens("forest"),
          id: "custom:forest",
          name: "Custom Forest",
          colors: { ...resolveThemeTokens("forest").colors, accent: "#ff0000" },
        },
      },
    },
  };
  const result = executeCommand(deck, {
    type: "SET_PRESENTATION_THEME",
    themeId: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).design.themeId, "ocean");
  assert.equal((result.deck as any).design.themeOverrides, undefined);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_CANVAS_FORMAT
// ---------------------------------------------------------------------------

test("SET_CANVAS_FORMAT changes slide format and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_CANVAS_FORMAT",
    format: "4:3",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).canvas.format, "4:3");
  assert.equal(result.patches[0]!.op, "canvas.set_format");
  assert.equal(result.patches[0]!.deckFields?.canvas?.format, "4:3");
});
