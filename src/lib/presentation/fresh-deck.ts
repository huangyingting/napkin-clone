/**
 * Pure utilities for seeding the slide editor with the freshest available deck.
 *
 * Extracted from SlideEditorButton so the logic is DOM-free and fully
 * testable under `node --test`.
 *
 * Raw persisted deck values are filtered by `normalizePersistedDeckJson` before
 * they are passed to `safeParseDeck`. Current storage returns parsed JSON
 * objects.
 */

import type { Deck } from "./deck";
import { safeParseDeck } from "./deck-schema";
import { normalizePersistedDeckJson } from "./persisted-deck";

/**
 * Returns the best initial deck to seed the editor from, in priority order:
 * 1. `fetchedRaw`  — freshly fetched from the server on panel open
 * 2. `cachedRaw`  — last value known to this component (prop or last save)
 * 3. `baseDeck`    — derived from the current Lexical editor state
 *
 * Each raw source is filtered then validated with `safeParseDeck` before being
 * accepted.
 */
export function pickFreshestDeck(
  fetchedRaw: unknown,
  cachedRaw: unknown,
  baseDeck: Deck,
): Deck {
  const fromFetched = safeParseDeck(normalizePersistedDeckJson(fetchedRaw));
  if (fromFetched.success) return fromFetched.data;

  const fromCached = safeParseDeck(normalizePersistedDeckJson(cachedRaw));
  if (fromCached.success) return fromCached.data;

  return baseDeck;
}
