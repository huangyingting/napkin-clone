/**
 * Boundary helper for opening a deck from raw persisted JSON.
 *
 * `openDeckFromJson` is the single entry point for loading deck JSON at editor,
 * present-mode, and public-render boundaries. It only accepts valid DeckV7
 * payloads; legacy deck shapes are intentionally rejected during development so
 * runtime surfaces stay v7-only.
 */

import { safeParseDeckV7 } from "./validation";
import type { DeckV7 } from "./schema";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OpenDeckResult =
  | {
      ok: true;
      deck: DeckV7;
    }
  | {
      ok: false;
      /** Human-readable error describing why the deck could not be opened. */
      error: string;
      /** Validation errors returned when attempting v7 parse (if applicable). */
      errors?: string[];
    };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens deck JSON from any persisted shape.
 *
 * Accepts v7 decks directly.
 * Returns `{ ok: false }` for anything that cannot be interpreted.
 */
export function openDeckFromJson(raw: unknown): OpenDeckResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Deck JSON must be a plain object." };
  }

  const version = raw.schemaVersion;

  // v7 — validate and return directly, no migration
  if (version === 7) {
    const result = safeParseDeckV7(raw);
    if (result.success) {
      return { ok: true, deck: result.data };
    }
    return {
      ok: false,
      error: `v7 deck validation failed: ${result.errors.join("; ")}`,
      errors: result.errors,
    };
  }

  // Unknown / missing / legacy schema version — attempt v7 parse for a useful error
  const result = safeParseDeckV7(raw);
  if (result.success) {
    return { ok: true, deck: result.data };
  }

  return {
    ok: false,
    error: `Unrecognised deck schema (version=${String(version)}). Expected schemaVersion 7.`,
    errors: result.errors,
  };
}

/**
 * Detects whether raw JSON appears to be a v7 deck without full validation.
 *
 * Useful for routing decisions before a full parse. Does not guarantee the
 * deck is structurally valid.
 */
export function looksLikeDeckV7(raw: unknown): boolean {
  return isPlainObject(raw) && raw.schemaVersion === 7;
}
