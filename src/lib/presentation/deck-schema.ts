/**
 * Validation facade for persisted deck JSON.
 *
 * `safeParseDeck` remains the public parse boundary while validators live in
 * schema-area modules under `deck-validation/`.
 */

import type { Deck } from "./deck";
import { validateDeck } from "./deck-validation/core";
import { DeckValidationError } from "./deck-validation/shared";

export { validateElement } from "./deck-validation/elements";
export {
  validateImageCrop,
  validateImageFitMode,
  validateImageMaskShape,
} from "./deck-validation/media";
export { validateSourceRef } from "./deck-validation/source-refs";

export type DeckParseResult =
  | { success: true; data: Deck }
  | { success: false; error: string };

/**
 * Non-throwing wrapper around the current deck schema validator.
 *
 * Only the current schema version is accepted.
 */
export function safeParseDeck(input: unknown): DeckParseResult {
  try {
    return { success: true, data: validateDeck(input) };
  } catch (error) {
    const message =
      error instanceof DeckValidationError ? error.message : "Invalid deck";
    return { success: false, error: message };
  }
}
