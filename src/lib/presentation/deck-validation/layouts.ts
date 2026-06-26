import {
  PLACEHOLDER_TYPES,
  type ElementBox,
  type LayoutPlaceholder,
  type PlaceholderType,
  type SlideLayout as DeckLayout,
} from "../deck";
import { SLIDE_FORMATS } from "../slide-format";
import {
  DeckValidationError,
  isPlainObject,
  isSlideFormat,
  validateFiniteNumber,
} from "./shared";

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

function validatePlaceholderType(
  value: unknown,
  context: string,
): PlaceholderType {
  if (!PLACEHOLDER_TYPES.includes(value as PlaceholderType)) {
    throw new DeckValidationError(
      `${context} must be one of: ${PLACEHOLDER_TYPES.join(", ")}`,
    );
  }
  return value as PlaceholderType;
}

function validateLayoutPlaceholder(
  input: unknown,
  context: string,
): LayoutPlaceholder {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  return {
    id: input.id,
    placeholderType: validatePlaceholderType(
      input.placeholderType,
      `${context}.placeholderType`,
    ),
    zIndex: validateFiniteNumber(input.zIndex, `${context}.zIndex`),
    box: validateBox(input.box, `${context}.box`),
    ...(typeof input.label === "string" && input.label.trim().length > 0
      ? { label: input.label }
      : {}),
  };
}

export function validateLayout(input: unknown, context: string): DeckLayout {
  if (!isPlainObject(input)) {
    throw new DeckValidationError(`${context} must be an object`);
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new DeckValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new DeckValidationError(`${context}.name must be a non-empty string`);
  }
  if (!isSlideFormat(input.format)) {
    throw new DeckValidationError(
      `${context}.format must be one of: ${SLIDE_FORMATS.join(", ")}`,
    );
  }
  if (!Array.isArray(input.placeholders)) {
    throw new DeckValidationError(`${context}.placeholders must be an array`);
  }
  const placeholders = input.placeholders.map((placeholder, index) =>
    validateLayoutPlaceholder(placeholder, `${context}.placeholders[${index}]`),
  );
  return {
    id: input.id,
    name: input.name,
    format: input.format,
    placeholders,
  };
}
