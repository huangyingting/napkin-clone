/**
 * Core outline → presentation Deck generation logic (issue #261).
 *
 * Like `@/lib/ai/generate`, this module is intentionally free of any network,
 * DOM, or React dependencies: the LLM call is injected as a `complete` function
 * so the logic can be unit tested deterministically. The route handler wires in
 * the real Azure client.
 *
 * Responsibilities (mirrors {@link generateVisuals}):
 *   - reject empty input and input longer than {@link MAX_INPUT_CHARS} BEFORE
 *     calling the model,
 *   - ask the model for a single {@link Deck} object via
 *     {@link buildDeckGenerationMessages},
 *   - tolerate code fences / surrounding prose when extracting JSON,
 *   - REPAIR the model output (clamp boxes, fix layouts/themes/ids, cap slides)
 *     so it stays {@link safeParseDeck}-valid,
 *   - strip any visual the model invented that is not in the inventory,
 *   - NORMALIZE the repaired deck (issue #264) via
 *     {@link normalizeGeneratedDeck} as the final step so every slide snaps to a
 *     template-conformant, theme-stamped, hierarchy-aware `elements[]` — the
 *     route therefore always returns layout-normalized output,
 *   - retry once on garbled output and, when retries are exhausted, throw a
 *     {@link GenerationError} with a clear message.
 */

import {
  buildDeckGenerationMessages,
  type DeckGenerationOptions,
  type DeckVisualInventoryItem,
} from "@/lib/ai/deck-prompt";
import { DECK_OUTPUT_TOKEN_BUDGET as CENTRAL_DECK_OUTPUT_TOKEN_BUDGET } from "@/lib/limits";
import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
  type CompleteFn,
} from "@/lib/ai/generate";
import { runGenerationAttempts } from "@/lib/ai/generation-runner";
import { REPAIRED_DECK_MAX_SLIDES, repairDeck } from "@/lib/ai/deck-repair";
import type { Deck, DeckTheme } from "@/lib/presentation/deck";
import { normalizeGeneratedDeck } from "@/lib/presentation/deck-layout-assign";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { reconcileDocumentDeckDependencies } from "@/lib/document/source-ref-model";

export type { DeckGenerationOptions } from "@/lib/ai/deck-prompt";

/** Upper bound on slides in a generated deck; surplus slides are dropped. */
export const MAX_DECK_SLIDES = REPAIRED_DECK_MAX_SLIDES;

/**
 * Soft cap on the model's output tokens for a deck generation, sized to hold a
 * full {@link MAX_DECK_SLIDES}-slide deck of compact JSON with headroom. Routes
 * pass this to the Azure client (`maxOutputTokens`) to keep responses within
 * model limits and predictably fast for long documents.
 */
export const DECK_OUTPUT_TOKEN_BUDGET = CENTRAL_DECK_OUTPUT_TOKEN_BUDGET;

/** Default number of LLM attempts (the first try plus retries). */
const DEFAULT_MAX_ATTEMPTS = 2;

export interface GenerateDeckInput {
  /** The structured outline the deck is built from. */
  outline: string;
  /** The visuals the model may reference by id (and only these). */
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>;
  /** Optional length/tone/audience tuning. */
  options?: DeckGenerationOptions;
  /**
   * Optional document-derived vibrant theme (from `inferDeckTheme`) used by
   * {@link normalizeGeneratedDeck} when the model returns `"default"` or a
   * missing/invalid theme (issue #281).
   */
  preferredTheme?: DeckTheme;
}

export interface GenerateDeckDeps {
  complete: CompleteFn;
  /** First attempt + retries. Defaults to {@link DEFAULT_MAX_ATTEMPTS}. */
  maxAttempts?: number;
}

/**
 * Generates a presentation {@link Deck} from a structured outline plus a visual
 * inventory the model may reference.
 *
 * @throws {EmptyInputError} when the outline is blank.
 * @throws {InputTooLongError} when the outline exceeds {@link MAX_INPUT_CHARS}.
 * @throws {GenerationError} when no valid deck can be produced.
 */
export async function generateDeck(
  input: GenerateDeckInput,
  deps: GenerateDeckDeps,
): Promise<Deck> {
  const outline = typeof input.outline === "string" ? input.outline.trim() : "";
  if (!outline) {
    throw new EmptyInputError();
  }
  if (outline.length > MAX_INPUT_CHARS) {
    throw new InputTooLongError(outline.length);
  }

  const visualInventory = input.visualInventory ?? [];
  const knownVisualIds = new Set(visualInventory.map((item) => item.id));
  const maxAttempts = Math.max(1, deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  return runGenerationAttempts<Deck, Deck>({
    pipeline: "deck",
    maxAttempts,
    initialFailureReason: "The AI did not return a valid deck.",
    complete: deps.complete,
    buildMessages: (retryReason) =>
      buildDeckGenerationMessages({
        outline,
        visualInventory,
        options: input.options,
        retryReason,
      }),
    repair: (parsed) => {
      const repaired = repairDeck(parsed);
      return repaired
        ? {
            success: true,
            data: repaired,
            meta: {
              slideCount: repaired.slides.length,
              inventoryCount: visualInventory.length,
            },
          }
        : {
            success: false,
            reason: "The AI response was not a valid deck object.",
            meta: { inventoryCount: visualInventory.length },
          };
    },
    validate: (repaired) => {
      const normalized = normalizeGeneratedDeck(
        reconcileDocumentDeckDependencies({
          deck: repaired,
          visualsById: knownVisualIds,
        }).deck,
        visualInventory,
        input.preferredTheme,
      );
      const final = safeParseDeck(normalized);
      return final.success
        ? { success: true, data: final.data }
        : {
            success: false,
            reason: final.error,
            meta: {
              slideCount: normalized.slides.length,
              inventoryCount: visualInventory.length,
            },
          };
    },
    makeServiceError: (reason, cause) =>
      new GenerationError(`The AI service could not be reached: ${reason}`, {
        cause,
      }),
    makeFinalError: (attempts, lastReason) =>
      new GenerationError(
        `Could not generate a valid deck after ${attempts} attempt(s). ${lastReason}`,
      ),
  });
}
