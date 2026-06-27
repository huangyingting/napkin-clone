import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type Slide,
} from "../deck-core";
import { SLIDE_FORMATS } from "../slide-format";
import {
  validateElement,
  validateBackgroundDesign,
  validateMasterElement,
} from "./elements";
import {
  DeckValidationError,
  isPlainObject,
  isSlideFormat,
  rejectUnknownKeys,
} from "./shared";

const DECK_KEYS = [
  "schemaVersion",
  "canvas",
  "design",
  "masters",
  "defaultMasterId",
  "customTemplates",
  "slides",
  "deckContentHash",
] as const;

const CANVAS_KEYS = ["format"] as const;
const PRESENTATION_DESIGN_KEYS = ["themeId", "themeOverrides"] as const;

const SLIDE_KEYS = [
  "id",
  "index",
  "title",
  "notes",
  "masterId",
  "templateId",
  "designOverrides",
  "elements",
  "source",
] as const;

const MASTER_KEYS = [
  "id",
  "name",
  "background",
  "designOverrides",
  "elements",
] as const;

const CUSTOM_TEMPLATE_KEYS = [
  "id",
  "name",
  "category",
  "defaultMasterId",
  "slideDesignDefaults",
  "elements",
] as const;

const TEMPLATE_ELEMENT_KEYS = [
  "id",
  "kind",
  "role",
  "box",
  "contentDefaults",
  "designOverrides",
] as const;

function validateUnknownObject(
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  return { ...input };
}

function validateCanvas(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError("Deck.canvas must be an object");
  }
  rejectUnknownKeys(input, CANVAS_KEYS, "Deck.canvas");
  if (!isSlideFormat(input.format)) {
    throw new DeckValidationError(
      `Deck.canvas.format must be one of: ${SLIDE_FORMATS.join(", ")}`,
    );
  }
  return { format: input.format };
}

function validatePresentationDesign(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new DeckValidationError("Deck.design must be an object");
  }
  rejectUnknownKeys(input, PRESENTATION_DESIGN_KEYS, "Deck.design");
  if (typeof input.themeId !== "string" || input.themeId.trim().length === 0) {
    throw new DeckValidationError(
      "Deck.design.themeId must be a non-empty string",
    );
  }
  return {
    themeId: input.themeId.trim(),
    ...(input.themeOverrides !== undefined
      ? {
          themeOverrides: validateUnknownObject(
            input.themeOverrides,
            "Deck.design.themeOverrides",
          ),
        }
      : {}),
  };
}

function validateDesignOverrides(
  input: unknown,
  context: string,
): Record<string, unknown> {
  const out = validateUnknownObject(input, context);
  if (out.background !== undefined) {
    out.background = validateBackgroundDesign(
      out.background,
      `${context}.background`,
    );
  }
  return out;
}

function validateSlide(input: unknown, index: number): Slide {
  const context = `slides[${index}]`;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  rejectUnknownKeys(input, SLIDE_KEYS, context);

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
  if (input.notes !== undefined && typeof input.notes !== "string") {
    throw new DeckValidationError(`${context}.notes must be a string`);
  }

  if (!Array.isArray(input.elements)) {
    throw new DeckValidationError(`${context}.elements must be an array`);
  }
  const elements = input.elements.map((element, elementIndex) =>
    validateElement(element, `${context}.elements[${elementIndex}]`),
  );

  return {
    id,
    index: input.index,
    title: input.title,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(typeof input.masterId === "string" && input.masterId.length > 0
      ? { masterId: input.masterId }
      : {}),
    ...(typeof input.templateId === "string" && input.templateId.length > 0
      ? { templateId: input.templateId }
      : {}),
    ...(input.designOverrides !== undefined
      ? {
          designOverrides: validateDesignOverrides(
            input.designOverrides,
            `${context}.designOverrides`,
          ),
        }
      : {}),
    elements,
    ...(input.source !== undefined
      ? { source: validateUnknownObject(input.source, `${context}.source`) }
      : {}),
  } as unknown as Slide;
}

function validateSlideMaster(
  input: unknown,
  index: number,
): Record<string, unknown> {
  const context = `Deck.masters[${index}]`;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  rejectUnknownKeys(input, MASTER_KEYS, context);
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new DeckValidationError(`${context}.name must be a non-empty string`);
  }
  if (!Array.isArray(input.elements)) {
    throw new DeckValidationError(`${context}.elements must be an array`);
  }
  return {
    id: input.id,
    name: input.name,
    ...(input.background !== undefined
      ? {
          background: validateBackgroundDesign(
            input.background,
            `${context}.background`,
          ),
        }
      : {}),
    ...(input.designOverrides !== undefined
      ? {
          designOverrides: validateDesignOverrides(
            input.designOverrides,
            `${context}.designOverrides`,
          ),
        }
      : {}),
    elements: input.elements.map((element, elementIndex) =>
      validateMasterElement(element, `${context}.elements[${elementIndex}]`),
    ),
  };
}

function validateCustomTemplate(
  input: unknown,
  index: number,
): Record<string, unknown> {
  const context = `Deck.customTemplates[${index}]`;
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  rejectUnknownKeys(input, CUSTOM_TEMPLATE_KEYS, context);
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new DeckValidationError(`${context}.name must be a non-empty string`);
  }
  if (
    typeof input.category !== "string" ||
    !["title", "section", "content", "media", "comparison", "blank"].includes(
      input.category,
    )
  ) {
    throw new DeckValidationError(
      `${context}.category must be one of: title, section, content, media, comparison, blank`,
    );
  }
  if (!Array.isArray(input.elements)) {
    throw new DeckValidationError(`${context}.elements must be an array`);
  }
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    ...(typeof input.defaultMasterId === "string" &&
    input.defaultMasterId.length > 0
      ? { defaultMasterId: input.defaultMasterId }
      : {}),
    ...(input.slideDesignDefaults !== undefined
      ? {
          slideDesignDefaults: validateDesignOverrides(
            input.slideDesignDefaults,
            `${context}.slideDesignDefaults`,
          ),
        }
      : {}),
    elements: input.elements.map((element, elementIndex) => {
      const elementContext = `${context}.elements[${elementIndex}]`;
      if (!isPlainObject(element)) {
        throw new DeckValidationError(`${elementContext} must be an object`);
      }
      rejectUnknownKeys(element, TEMPLATE_ELEMENT_KEYS, elementContext);
      if (element.contentDefaults !== undefined) {
        validateUnknownObject(
          element.contentDefaults,
          `${elementContext}.contentDefaults`,
        );
      }
      return validateUnknownObject(element, elementContext);
    }),
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
  rejectUnknownKeys(input, DECK_KEYS, "Deck");

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

  const canvas = validateCanvas(input.canvas);
  const design = validatePresentationDesign(input.design);

  if (!Array.isArray(input.masters)) {
    throw new DeckValidationError("Deck.masters must be an array");
  }
  const masters = input.masters.map(validateSlideMaster);
  if (
    typeof input.defaultMasterId !== "string" ||
    input.defaultMasterId.length === 0
  ) {
    throw new DeckValidationError(
      "Deck.defaultMasterId must be a non-empty string",
    );
  }
  const masterIds = new Set(masters.map((master) => master.id));
  if (!masterIds.has(input.defaultMasterId)) {
    throw new DeckValidationError(
      "Deck.defaultMasterId must reference an existing master",
    );
  }

  if (!Array.isArray(input.slides)) {
    throw new DeckValidationError("Deck.slides must be an array");
  }

  const slides = input.slides.map(validateSlide);

  const deck: Record<string, unknown> = {
    schemaVersion: input.schemaVersion,
    canvas,
    design,
    masters,
    defaultMasterId: input.defaultMasterId,
    ...(input.customTemplates !== undefined
      ? {
          customTemplates: Array.isArray(input.customTemplates)
            ? input.customTemplates.map(validateCustomTemplate)
            : (() => {
                throw new DeckValidationError(
                  "Deck.customTemplates must be an array",
                );
              })(),
        }
      : {}),
    slides,
  };

  if (input.deckContentHash !== undefined) {
    if (typeof input.deckContentHash !== "string") {
      throw new DeckValidationError("Deck.deckContentHash must be a string");
    }
    if (input.deckContentHash.length > 0) {
      deck.deckContentHash = input.deckContentHash;
    }
  }

  return deck as unknown as Deck;
}
