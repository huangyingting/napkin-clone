/**
 * Pure utilities for seeding the slide editor with the freshest available deck.
 *
 * Extracted from SlideEditorButton so the logic is DOM-free and fully
 * testable under `node --test`.
 *
 * `normalizeDeckRaw` is the **single canonical helper** for coercing a raw
 * deckJson DB value before it is passed to `safeParseDeck`. All read paths
 * (editor, present, embed) must go through this function (#141).
 */

import type { Deck } from "./deck";
import { safeParseDeck } from "./deck-schema";

/**
 * Canonical coercion helper for raw deckJson values as they arrive from the
 * DB or a prop. Prisma can return JSON columns as a parsed object or, on some
 * providers (SQLite/legacy), as a serialised JSON string.
 *
 * - `object` (non-string)  → returned unchanged
 * - valid JSON string       → parsed and returned as an object
 * - invalid/empty string   → `null` (safe fallback; callers should treat null
 *                            as "no persisted deck")
 * - `null` / `undefined`   → returned unchanged
 */
export function normalizeDeckRaw(raw: unknown): unknown {
  if (typeof raw === "string") {
    if (raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
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
