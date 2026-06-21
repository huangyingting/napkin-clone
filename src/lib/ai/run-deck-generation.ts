/**
 * Pure deck-generation orchestration (issue #265).
 *
 * Extracts the network-free core of the `POST /api/generate-deck` route so it
 * can be unit tested deterministically under `node --test`: it folds a
 * serialised Lexical document (`contentJson`) plus the document's visuals into
 * the `{ outline, visualInventory }` source via {@link buildDeckSource}, then
 * asks {@link generateDeck} to produce a layout-normalized {@link Deck}.
 *
 * Like its `@/lib/ai` siblings, this module has NO HTTP, quota, credit, or DB
 * concerns — the LLM call is injected as a `complete` function. The route wires
 * in the real Azure client (wrapped in the abort deadline); tests pass a stub.
 *
 * Error contract (unchanged from {@link generateDeck}):
 *   - empty/blank outline  → {@link EmptyInputError},
 *   - outline too long      → {@link InputTooLongError},
 *   - unrecoverable model output → {@link GenerationError}.
 */

import { buildDeckSource } from "@/lib/ai/deck-source";
import type { CompleteFn } from "@/lib/ai/generate";
import {
  generateDeck,
  type DeckGenerationOptions,
} from "@/lib/ai/generate-deck";
import type { Deck } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";

export interface RunDeckGenerationInput {
  /** Serialised Lexical editor state (string or pre-parsed) to build from. */
  contentJson: unknown;
  /** The document's visuals, keyed by visual id. May be empty. */
  visuals: ReadonlyMap<string, Visual>;
  /** The injected LLM completion function. */
  complete: CompleteFn;
  /** Optional length/tone/audience tuning. */
  options?: DeckGenerationOptions;
  /** First attempt + retries; forwarded to {@link generateDeck}. */
  maxAttempts?: number;
}

/**
 * Builds the deck source from `contentJson` + `visuals` and generates a
 * normalized {@link Deck}. Pure with respect to I/O: all network access happens
 * inside the injected `complete`.
 */
export async function runDeckGeneration(
  input: RunDeckGenerationInput,
): Promise<Deck> {
  const source = buildDeckSource(input.contentJson, input.visuals);
  return generateDeck(
    {
      outline: source.outline,
      visualInventory: source.visualInventory,
      ...(input.options !== undefined ? { options: input.options } : {}),
    },
    {
      complete: input.complete,
      ...(input.maxAttempts !== undefined
        ? { maxAttempts: input.maxAttempts }
        : {}),
    },
  );
}
