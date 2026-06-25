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

import {
  buildDeckGenerationSource,
  type DeckGenerationSource,
} from "@/lib/ai/deck-source";
import type { CompleteFn } from "@/lib/ai/generate";
import {
  generateDeck,
  type DeckGenerationOptions,
} from "@/lib/ai/generate-deck";
import type { Deck, DeckTheme } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";

export interface RunDeckGenerationInput {
  /** Serialised Lexical editor state (string or pre-parsed) to build from. */
  contentJson: unknown;
  /** The document's visuals, keyed by visual id. May be empty. */
  visuals: ReadonlyMap<string, Visual>;
  /** Precomputed source from the route/parser; avoids drifting re-extraction. */
  source?: DeckGenerationSource;
  /** The injected LLM completion function. */
  complete: CompleteFn;
  /** Optional length/tone/audience tuning. */
  options?: DeckGenerationOptions;
  /** First attempt + retries; forwarded to {@link generateDeck}. */
  maxAttempts?: number;
  /**
   * Optional document-derived vibrant theme (from `inferDeckTheme`) forwarded to
   * {@link generateDeck} → {@link normalizeGeneratedDeck} so a model `"default"`
   * (or missing/invalid) theme is replaced with a vibrant one (issue #281).
   */
  preferredTheme?: DeckTheme;
}

/**
 * The result of a deck-generation run: the normalized {@link Deck} plus whether
 * the source outline was deterministically truncated to fit the input budget,
 * so callers can surface a "content truncated" notice to the user.
 */
export interface RunDeckGenerationResult {
  deck: Deck;
  /** True when {@link buildDeckSource} trimmed the outline to fit the budget. */
  truncated: boolean;
}

/**
 * Builds the deck source from `contentJson` + `visuals` and generates a
 * normalized {@link Deck}. Pure with respect to I/O: all network access happens
 * inside the injected `complete`. Returns the deck together with the source's
 * `truncated` flag.
 */
export async function runDeckGeneration(
  input: RunDeckGenerationInput,
): Promise<RunDeckGenerationResult> {
  const source =
    input.source ?? buildDeckGenerationSource(input.contentJson, input.visuals);
  const deck = await generateDeck(
    {
      outline: source.outline,
      visualInventory: source.visualInventory,
      ...(input.options !== undefined ? { options: input.options } : {}),
      ...(input.preferredTheme !== undefined
        ? { preferredTheme: input.preferredTheme }
        : {}),
    },
    {
      complete: input.complete,
      ...(input.maxAttempts !== undefined
        ? { maxAttempts: input.maxAttempts }
        : {}),
    },
  );
  return { deck, truncated: source.truncated };
}
