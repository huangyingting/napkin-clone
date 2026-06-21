/**
 * Validation for an edited {@link Deck} persisted on a document (`deckJson`).
 *
 * Mirrors the `validateVisual` / `safeParseVisual` pattern in
 * `src/lib/visual/schema.ts`: a strict, throwing `validateDeck` plus a
 * non-throwing `safeParseDeck` wrapper. No Zod, no browser/React deps — fully
 * testable under `node --test`.
 */

import type {
  Deck,
  DeckTheme,
  ElementAlign,
  ElementBox,
  ShapeKind,
  Slide,
  SlideElement,
  SlideLayout,
  TextElementStyle,
} from "./deck";

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

const ELEMENT_ALIGNS: readonly ElementAlign[] = ["left", "center", "right"];
const SHAPE_KINDS: readonly ShapeKind[] = ["rect", "ellipse", "line"];

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function validateFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DeckValidationError(`${context} must be a finite number`);
  }
  return value;
}

function validateBox(input: unknown, context: string): ElementBox {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  return {
    x: validateFiniteNumber(input.x, `${context}.x`),
    y: validateFiniteNumber(input.y, `${context}.y`),
    w: validateFiniteNumber(input.w, `${context}.w`),
    h: validateFiniteNumber(input.h, `${context}.h`),
  };
}

function validateTextStyle(input: unknown, context: string): TextElementStyle {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (
    typeof input.align !== "string" ||
    !ELEMENT_ALIGNS.includes(input.align as ElementAlign)
  ) {
    throw new DeckValidationError(
      `${context}.align must be one of: ${ELEMENT_ALIGNS.join(", ")}`,
    );
  }
  if (input.color !== undefined && !isHexColor(input.color)) {
    throw new DeckValidationError(`${context}.color must be a hex color`);
  }
  return {
    fontSize: validateFiniteNumber(input.fontSize, `${context}.fontSize`),
    bold: Boolean(input.bold),
    italic: Boolean(input.italic),
    align: input.align as ElementAlign,
    ...(input.color !== undefined ? { color: input.color as string } : {}),
  };
}

function validateElement(input: unknown, context: string): SlideElement {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  const box = validateBox(input.box, `${context}.box`);
  const zIndex = validateFiniteNumber(input.zIndex, `${context}.zIndex`);
  const base = { id: input.id, box, zIndex };

  switch (input.kind) {
    case "text": {
      if (typeof input.text !== "string") {
        throw new DeckValidationError(`${context}.text must be a string`);
      }
      if (input.role !== "title" && input.role !== "body") {
        throw new DeckValidationError(
          `${context}.role must be "title" or "body"`,
        );
      }
      return {
        ...base,
        kind: "text",
        text: input.text,
        role: input.role,
        style: validateTextStyle(input.style, `${context}.style`),
      };
    }
    case "bullets":
      return {
        ...base,
        kind: "bullets",
        bullets: validateStringArray(input.bullets, `${context}.bullets`),
        style: validateTextStyle(input.style, `${context}.style`),
      };
    case "visual": {
      if (typeof input.visualId !== "string" || input.visualId.length === 0) {
        throw new DeckValidationError(
          `${context}.visualId must be a non-empty string`,
        );
      }
      if (
        input.styleThemeId !== undefined &&
        typeof input.styleThemeId !== "string"
      ) {
        throw new DeckValidationError(
          `${context}.styleThemeId must be a string`,
        );
      }
      return {
        ...base,
        kind: "visual",
        visualId: input.visualId,
        ...(typeof input.styleThemeId === "string" &&
        input.styleThemeId.length > 0
          ? { styleThemeId: input.styleThemeId }
          : {}),
      };
    }
    case "image": {
      if (typeof input.src !== "string" || input.src.length === 0) {
        throw new DeckValidationError(
          `${context}.src must be a non-empty string`,
        );
      }
      if (input.alt !== undefined && typeof input.alt !== "string") {
        throw new DeckValidationError(`${context}.alt must be a string`);
      }
      return {
        ...base,
        kind: "image",
        src: input.src,
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
      };
    }
    case "shape": {
      if (
        typeof input.shape !== "string" ||
        !SHAPE_KINDS.includes(input.shape as ShapeKind)
      ) {
        throw new DeckValidationError(
          `${context}.shape must be one of: ${SHAPE_KINDS.join(", ")}`,
        );
      }
      if (!isHexColor(input.color)) {
        throw new DeckValidationError(`${context}.color must be a hex color`);
      }
      return {
        ...base,
        kind: "shape",
        shape: input.shape as ShapeKind,
        color: input.color,
      };
    }
    default:
      throw new DeckValidationError(
        `${context}.kind must be one of: text, bullets, visual, image, shape`,
      );
  }
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

  let elements: SlideElement[] | undefined;
  if (input.elements !== undefined) {
    if (!Array.isArray(input.elements)) {
      throw new DeckValidationError(`${context}.elements must be an array`);
    }
    elements = input.elements.map((element, elementIndex) =>
      validateElement(element, `${context}.elements[${elementIndex}]`),
    );
  }

  if (input.background !== undefined && !isHexColor(input.background)) {
    throw new DeckValidationError(`${context}.background must be a hex color`);
  }
  if (input.accent !== undefined && !isHexColor(input.accent)) {
    throw new DeckValidationError(`${context}.accent must be a hex color`);
  }

  return {
    index: input.index,
    title: input.title,
    bullets,
    visualIds,
    layout: input.layout,
    notes: input.notes,
    theme: input.theme,
    ...(elements !== undefined ? { elements } : {}),
    ...(input.background !== undefined
      ? { background: input.background as string }
      : {}),
    ...(input.accent !== undefined ? { accent: input.accent as string } : {}),
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

  const deck: Deck = { slides, theme };

  if (input.deckContentHash !== undefined) {
    if (typeof input.deckContentHash !== "string") {
      throw new DeckValidationError("Deck.deckContentHash must be a string");
    }
    if (input.deckContentHash.length > 0) {
      deck.deckContentHash = input.deckContentHash;
    }
  }

  return deck;
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
