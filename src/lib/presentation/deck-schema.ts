/**
 * Validation for an edited {@link Deck} persisted on a document (`deckJson`).
 *
 * Mirrors the `validateVisual` / `safeParseVisual` pattern in
 * `src/lib/visual/schema.ts`: a strict, throwing `validateDeck` plus a
 * non-throwing `safeParseDeck` wrapper. No Zod, no browser/React deps — fully
 * testable under `node --test`.
 */

import type { Deck, DeckTheme, Slide, SlideLayout } from "./deck";

const DECK_THEMES: readonly DeckTheme[] = [
  "indigo",
  "ocean",
  "forest",
  "sunset",
  "grape",
  "default",
];

const SLIDE_LAYOUTS: readonly SlideLayout[] = [
  "title",
  "section",
  "content",
  "media",
  "blank",
];

class DeckValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeckTheme(value: unknown): value is DeckTheme {
  return typeof value === "string" && DECK_THEMES.includes(value as DeckTheme);
}

function isSlideLayout(value: unknown): value is SlideLayout {
  return (
    typeof value === "string" && SLIDE_LAYOUTS.includes(value as SlideLayout)
  );
}

function validateStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new DeckValidationError(`${context}[${index}] must be a string`);
    }
    return entry;
  });
}

function validateSlide(input: unknown, index: number): Slide {
  const context = `slides[${index}]`;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }

  if (typeof input.index !== "number" || !Number.isFinite(input.index)) {
    throw new DeckValidationError(`${context}.index must be a number`);
  }
  if (typeof input.title !== "string") {
    throw new DeckValidationError(`${context}.title must be a string`);
  }
  const bullets = validateStringArray(input.bullets, `${context}.bullets`);
  const visualIds = validateStringArray(
    input.visualIds,
    `${context}.visualIds`,
  );
  if (!isSlideLayout(input.layout)) {
    throw new DeckValidationError(
      `${context}.layout must be one of: ${SLIDE_LAYOUTS.join(", ")}`,
    );
  }
  if (typeof input.notes !== "string") {
    throw new DeckValidationError(`${context}.notes must be a string`);
  }
  if (!isDeckTheme(input.theme)) {
    throw new DeckValidationError(
      `${context}.theme must be one of: ${DECK_THEMES.join(", ")}`,
    );
  }

  return {
    index: input.index,
    title: input.title,
    bullets,
    visualIds,
    layout: input.layout,
    notes: input.notes,
    theme: input.theme,
  };
}

/**
 * Validates an unknown value against the deck schema, returning a fully
 * populated `Deck` or throwing a `DeckValidationError` describing the first
 * problem found. A missing top-level `theme` defaults to `"default"`.
 */
function validateDeck(input: unknown): Deck {
  if (!isPlainObject(input)) {
    throw new DeckValidationError("Deck must be an object");
  }

  const theme =
    input.theme === undefined
      ? "default"
      : isDeckTheme(input.theme)
        ? input.theme
        : (() => {
            throw new DeckValidationError(
              `Deck.theme must be one of: ${DECK_THEMES.join(", ")}`,
            );
          })();

  if (!Array.isArray(input.slides)) {
    throw new DeckValidationError("Deck.slides must be an array");
  }

  const slides = input.slides.map(validateSlide);

  return { slides, theme };
}

export type DeckParseResult =
  | { success: true; data: Deck }
  | { success: false; error: string };

/** Non-throwing wrapper around {@link validateDeck}. */
export function safeParseDeck(input: unknown): DeckParseResult {
  try {
    return { success: true, data: validateDeck(input) };
  } catch (error) {
    const message =
      error instanceof DeckValidationError ? error.message : "Invalid deck";
    return { success: false, error: message };
  }
}
