import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type Slide,
} from "../deck-core";
import {
  SLIDE_LAYOUTS,
  type SlideLayout as DeckLayout,
  type SlideLayoutHint,
} from "../deck-layouts-model";
import { DEFAULT_SLIDE_FORMAT, SLIDE_FORMATS } from "../slide-format";
import type { MasterSlide } from "../deck-theme-token-types";
import {
  validateElement,
  validateBulletRuns,
  validateTextRuns,
} from "./elements";
import { validateLayout } from "./layouts";
import { validateCustomTokenSet, validateMaster } from "./theme";
import {
  DeckValidationError,
  isHexColor,
  isPlainObject,
  isSlideFormat,
  isSlideLayoutHint,
  validateStringArray,
} from "./shared";

function validateSlide(input: unknown, index: number): Slide {
  const context = `slides[${index}]`;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }

  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  const id = input.id;

  if (typeof input.index !== "number" || !Number.isFinite(input.index)) {
    throw new DeckValidationError(`${context}.index must be a number`);
  }
  if (typeof input.title !== "string") {
    throw new DeckValidationError(`${context}.title must be a string`);
  }
  const bullets = validateStringArray(input.bullets, `${context}.bullets`);
  const titleRuns =
    input.titleRuns !== undefined
      ? validateTextRuns(input.titleRuns, `${context}.titleRuns`)
      : undefined;
  const bulletRuns =
    input.bulletRuns !== undefined
      ? validateBulletRuns(input.bulletRuns, `${context}.bulletRuns`)
      : undefined;
  const visualIds = validateStringArray(
    input.visualIds,
    `${context}.visualIds`,
  );
  if (!isSlideLayoutHint(input.layout)) {
    throw new DeckValidationError(
      `${context}.layout must be one of: ${SLIDE_LAYOUTS.join(", ")}`,
    );
  }
  if (typeof input.notes !== "string") {
    throw new DeckValidationError(`${context}.notes must be a string`);
  }

  if (!Array.isArray(input.elements)) {
    throw new DeckValidationError(`${context}.elements must be an array`);
  }
  const elements = input.elements.map((element, elementIndex) =>
    validateElement(element, `${context}.elements[${elementIndex}]`),
  );

  if (input.background !== undefined && !isHexColor(input.background)) {
    throw new DeckValidationError(`${context}.background must be a hex color`);
  }
  let backgroundGradient:
    | { from: string; to: string; angle?: number }
    | undefined;
  if (input.backgroundGradient !== undefined) {
    const g = input.backgroundGradient;
    if (!isPlainObject(g) || !isHexColor(g.from) || !isHexColor(g.to)) {
      throw new DeckValidationError(
        `${context}.backgroundGradient.from/to must be hex colors`,
      );
    }
    backgroundGradient = {
      from: g.from,
      to: g.to,
      ...(typeof g.angle === "number" && Number.isFinite(g.angle)
        ? { angle: g.angle }
        : {}),
    };
  }
  if (
    input.backgroundImage !== undefined &&
    (typeof input.backgroundImage !== "string" ||
      input.backgroundImage.length === 0)
  ) {
    throw new DeckValidationError(
      `${context}.backgroundImage must be a non-empty string`,
    );
  }
  if (
    input.backgroundAssetId !== undefined &&
    (typeof input.backgroundAssetId !== "string" ||
      input.backgroundAssetId.length === 0)
  ) {
    throw new DeckValidationError(
      `${context}.backgroundAssetId must be a non-empty string`,
    );
  }
  if (input.accent !== undefined && !isHexColor(input.accent)) {
    throw new DeckValidationError(`${context}.accent must be a hex color`);
  }
  // masterRef — optional non-empty string
  const masterRef =
    typeof input.masterRef === "string" && input.masterRef.length > 0
      ? input.masterRef
      : undefined;
  if (
    input.elementsDerived !== undefined &&
    typeof input.elementsDerived !== "boolean"
  ) {
    throw new DeckValidationError(
      `${context}.elementsDerived must be a boolean`,
    );
  }

  // Preserve a persisted sourceSectionId verbatim — only buildDeckFromBlocks
  // assigns it; validateSlide never backfills or re-derives it.
  const sourceSectionId =
    typeof input.sourceSectionId === "string" &&
    input.sourceSectionId.length > 0
      ? input.sourceSectionId
      : undefined;

  return {
    id,
    index: input.index,
    title: input.title,
    ...(titleRuns !== undefined ? { titleRuns } : {}),
    bullets,
    ...(bulletRuns !== undefined ? { bulletRuns } : {}),
    visualIds,
    layout: input.layout as SlideLayoutHint,
    notes: input.notes,
    elements,
    ...(input.elementsDerived !== undefined
      ? { elementsDerived: input.elementsDerived as boolean }
      : {}),
    ...(sourceSectionId !== undefined ? { sourceSectionId } : {}),
    ...(input.background !== undefined
      ? { background: input.background as string }
      : {}),
    ...(backgroundGradient !== undefined ? { backgroundGradient } : {}),
    ...(input.backgroundImage !== undefined
      ? { backgroundImage: input.backgroundImage as string }
      : {}),
    ...(input.backgroundAssetId !== undefined
      ? { backgroundAssetId: input.backgroundAssetId as string }
      : {}),
    ...(input.accent !== undefined ? { accent: input.accent as string } : {}),
    ...(masterRef !== undefined ? { masterRef } : {}),
  };
}

/**
 * Validates an unknown value against the deck schema, returning a fully
 * populated `Deck` or throwing a `DeckValidationError` describing the first
 * problem found. Current deck payloads must carry a top-level `themeId`.
 */
export function validateDeck(input: unknown): Deck {
  if (!isPlainObject(input)) {
    throw new DeckValidationError("Deck must be an object");
  }

  if (typeof input.themeId !== "string") {
    throw new DeckValidationError("Deck.themeId must be a string");
  }
  const themeId = input.themeId.trim();
  if (themeId.length === 0) {
    throw new DeckValidationError("Deck.themeId must be a non-empty string");
  }

  const slideFormat =
    input.slideFormat === undefined
      ? DEFAULT_SLIDE_FORMAT
      : isSlideFormat(input.slideFormat)
        ? input.slideFormat
        : (() => {
            throw new DeckValidationError(
              `Deck.slideFormat must be one of: ${SLIDE_FORMATS.join(", ")}`,
            );
          })();

  if (!Array.isArray(input.slides)) {
    throw new DeckValidationError("Deck.slides must be an array");
  }

  const slides = input.slides.map(validateSlide);
  let layouts: DeckLayout[] | undefined;
  if (input.layouts !== undefined) {
    if (!Array.isArray(input.layouts)) {
      throw new DeckValidationError("Deck.layouts must be an array");
    }
    layouts = input.layouts.map((layout, index) =>
      validateLayout(layout, `Deck.layouts[${index}]`),
    );
  }

  const deck: Deck = {
    slides,
    themeId,
    slideFormat,
    ...(layouts !== undefined ? { layouts } : {}),
  };

  if (input.deckContentHash !== undefined) {
    if (typeof input.deckContentHash !== "string") {
      throw new DeckValidationError("Deck.deckContentHash must be a string");
    }
    if (input.deckContentHash.length > 0) {
      deck.deckContentHash = input.deckContentHash;
    }
  }

  if (
    typeof input.schemaVersion !== "number" ||
    !Number.isInteger(input.schemaVersion)
  ) {
    throw new DeckValidationError("Deck.schemaVersion must be an integer");
  }
  if (input.schemaVersion !== CURRENT_DECK_SCHEMA_VERSION) {
    throw new DeckValidationError(
      `Deck.schemaVersion ${input.schemaVersion} is not supported (current: ${CURRENT_DECK_SCHEMA_VERSION})`,
    );
  }
  deck.schemaVersion = input.schemaVersion;

  if (input.masters !== undefined) {
    if (!Array.isArray(input.masters)) {
      throw new DeckValidationError("Deck.masters must be an array");
    }
    const masters: MasterSlide[] = input.masters.map((master, index) =>
      validateMaster(master, `Deck.masters[${index}]`),
    );
    deck.masters = masters;
    // Strip masterRefs pointing to non-existent masters (warn but don't fail)
    const masterIds = new Set(masters.map((m) => m.id));
    deck.slides = deck.slides.map((slide) => {
      if (slide.masterRef !== undefined && !masterIds.has(slide.masterRef)) {
        const { masterRef: _stripped, ...rest } = slide;
        return rest as typeof slide;
      }
      return slide;
    });
  }

  if (input.customTokenSet !== undefined) {
    deck.customTokenSet = validateCustomTokenSet(
      input.customTokenSet,
      "Deck.customTokenSet",
    );
  }

  return deck;
}
