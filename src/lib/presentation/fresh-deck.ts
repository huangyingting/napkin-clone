/**
 * Pure utilities for seeding the slide editor with the freshest available deck.
 *
 * Extracted from SlideEditorButton so the logic is DOM-free and fully
 * testable under `node --test`.
 *
 * NOTE: #141 (later wave) will centralise deckJson normalisation — keep this
 * minimal and compatible; do not add new normalisation concerns here.
 */

import type { Deck } from "./deck";
import { safeParseDeck } from "./deck-schema";

/**
 * Normalises a raw deckJson value as it may arrive from the DB or a prop.
 * Prisma can return JSON columns as a parsed object or, on some providers, as
 * a serialised JSON string. Mirrors the pattern used in the present/embed pages.
 */
export function normalizeDeckRaw(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Returns the best initial deck to seed the editor from, in priority order:
 * 1. `fetchedRaw`  — freshly fetched from the server on panel open
 * 2. `fallbackRaw` — last value known to this component (prop or last save)
 * 3. `baseDeck`    — derived from the current Lexical editor state
 *
 * Each raw source is normalised (string → object) then validated with
 * `safeParseDeck` before being accepted.
 */
export function pickFreshestDeck(
  fetchedRaw: unknown,
  fallbackRaw: unknown,
  baseDeck: Deck,
): Deck {
  const fromFetched = safeParseDeck(normalizeDeckRaw(fetchedRaw));
  if (fromFetched.success) return fromFetched.data;

  const fromFallback = safeParseDeck(normalizeDeckRaw(fallbackRaw));
  if (fromFallback.success) return fromFallback.data;

  return baseDeck;
}
