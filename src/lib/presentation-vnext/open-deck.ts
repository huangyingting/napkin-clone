/**
 * Boundary helper for opening a deck from raw persisted JSON.
 *
 * `openDeckFromJson` is the single entry point for loading deck JSON at editor,
 * present-mode, and public-render boundaries. It:
 *   1. Returns the parsed v7 deck directly when `schemaVersion === 7`.
 *   2. Attempts a best-effort v6 → v7 migration when a lower schema version is
 *      detected (migration-at-boundary pattern — see spec §Hard Decisions).
 *   3. Returns a typed error for any input that cannot be parsed as either.
 *
 * Rules:
 * - Does NOT call `safeParseDeckV7` on v6 input — the v7 validator intentionally
 *   rejects v6 shape fields.
 * - Does NOT modify the v7 validator to accept v6 — that is explicitly a
 *   non-goal of the spec.
 * - Migration only happens at this boundary, never inside the runtime render path.
 */

import { safeParseDeckV7 } from "./validation";
import { migrateV6ToDeckV7 } from "./migration-v6";
import type { DeckV7 } from "./schema";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OpenDeckResult =
  | {
      ok: true;
      deck: DeckV7;
      /** True when the deck was migrated from a v6 source. */
      migrated: boolean;
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
 * Accepts v7 decks directly, and migrates v6 decks at the boundary.
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
      return { ok: true, deck: result.data, migrated: false };
    }
    return {
      ok: false,
      error: `v7 deck validation failed: ${result.errors.join("; ")}`,
      errors: result.errors,
    };
  }

  // v6 or older — attempt migration at the boundary
  if (typeof version === "number" && version < 7) {
    try {
      const migration = migrateV6ToDeckV7(raw);
      return { ok: true, deck: migration.deck, migrated: true };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown migration error";
      return { ok: false, error: `v6 migration threw: ${msg}` };
    }
  }

  // Unknown / missing schema version — attempt v7 parse for a useful error
  const result = safeParseDeckV7(raw);
  if (result.success) {
    return { ok: true, deck: result.data, migrated: false };
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
