/**
 * Shared size limits for deck-JSON serialization.
 *
 * This module is pure, DOM-free, and server-free so it can be imported by
 * both the server action (`actions.ts`) and client-side helpers
 * (`image-element.ts`) without side-effects or "use client" / "use server"
 * boundary violations.
 */

/**
 * Hard cap (in characters / bytes, ASCII JSON) on the serialized deck JSON
 * that the server will accept. Saves that exceed this length are rejected with
 * "Deck is too large to save." — value is unchanged from the previous
 * server-local constant so server behavior is identical.
 */
export const MAX_DECK_JSON_BYTES = 500_000;

/**
 * Headroom reserved for non-image deck JSON: slide structure, text content,
 * theme tokens, layout metadata, element geometry, etc. Subtracting this from
 * {@link MAX_DECK_JSON_BYTES} yields {@link TOTAL_IMAGE_BUDGET_BYTES} — the
 * safe upper bound on all inlined image data URLs combined.
 *
 * 100 KB is generous even for text-heavy, multi-slide decks; the remaining
 * 400 KB is allocated entirely to inlined image payload.
 */
export const DECK_JSON_NON_IMAGE_RESERVE = 100_000;
