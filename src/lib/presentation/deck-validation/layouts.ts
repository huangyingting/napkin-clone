import type { PlaceholderElement } from "../deck-elements";
import type { SlideLayout as DeckLayout } from "../deck-layouts-model";
import { SLIDE_FORMATS } from "../slide-format";
import { validateElement } from "./elements";
import { DeckValidationError, isPlainObject, isSlideFormat } from "./shared";

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
  const placeholders = input.placeholders.map((placeholder, index) => {
    const validated = validateElement(
      placeholder,
      `${context}.placeholders[${index}]`,
    );
    if (validated.kind !== "placeholder") {
      throw new DeckValidationError(
        `${context}.placeholders[${index}] must be a placeholder element`,
      );
    }
    return validated as PlaceholderElement;
  });
  return {
    id: input.id,
    name: input.name,
    format: input.format,
    placeholders,
  };
}
