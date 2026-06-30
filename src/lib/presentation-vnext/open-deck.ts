/**
 * Boundary helper for opening a deck from raw persisted JSON.
 *
 * `openDeckFromJson` is the single entry point for loading deck JSON at editor,
 * present-mode, and public-render boundaries. It accepts valid DeckV7 payloads
 * directly and performs one-time legacy v6 migration before the editor runtime
 * sees the deck.
 */

import type { PresentationDiagnostic } from "./diagnostics";
import {
  migrateLegacyDeckV6,
  looksLikeLegacyDeckV6,
  type MigrationIdMap,
} from "./migration-v6";
import { safeParseDeckV7 } from "./validation";
import type { DeckV7 } from "./schema";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OpenDeckResult =
  | {
      ok: true;
      deck: DeckV7;
      source: "v7" | "legacy-v6";
      diagnostics: PresentationDiagnostic[];
      /**
       * Old→new identity mapping, present only for `legacy-v6` opens. Lets
       * downstream consumers (comment / source-anchor migration) remap
       * references that pointed at rewritten ids. Absent for `v7` pass-through,
       * which never rewrites ids.
       */
      idMap?: MigrationIdMap;
    }
  | {
      ok: false;
      /** Human-readable error describing why the deck could not be opened. */
      error: string;
      /** Validation errors returned when attempting v7 parse (if applicable). */
      errors?: string[];
      diagnostics: PresentationDiagnostic[];
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
    return {
      ok: false,
      error: "Deck JSON must be a plain object.",
      diagnostics: [],
    };
  }

  const version = raw.schemaVersion;

  // v7 — validate and return directly, no migration
  if (version === 7) {
    const result = safeParseDeckV7(raw);
    if (result.success) {
      return { ok: true, deck: result.data, source: "v7", diagnostics: [] };
    }
    return {
      ok: false,
      error: `v7 deck validation failed: ${result.errors.join("; ")}`,
      errors: result.errors,
      diagnostics: [],
    };
  }

  if (version === 6 || looksLikeLegacyDeckV6(raw)) {
    const migrated = migrateLegacyDeckV6(raw);
    if (migrated.ok) {
      return {
        ok: true,
        deck: migrated.deck,
        source: "legacy-v6",
        diagnostics: migrated.diagnostics,
        idMap: migrated.idMap,
      };
    }
    return {
      ok: false,
      error: migrated.error,
      errors: migrated.errors,
      diagnostics: migrated.diagnostics,
    };
  }

  // Unknown / missing / legacy schema version — attempt v7 parse for a useful error
  const result = safeParseDeckV7(raw);
  if (result.success) {
    return { ok: true, deck: result.data, source: "v7", diagnostics: [] };
  }

  return {
    ok: false,
    error: `Unrecognised deck schema (version=${String(version)}). Expected schemaVersion 7.`,
    errors: result.errors,
    diagnostics: [],
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

/**
 * Routes an AI-generated deck through the same validating open boundary.
 *
 * The AI deck-generation pipeline parses model output with `safeParseDeckV7`
 * before it reaches the editor, but the apply path must still pass through the
 * single open boundary so a malformed proposal produces structured diagnostics
 * (and a recovery surface) instead of silently replacing the editor with a
 * blank deck. This thin wrapper exists so the AI-apply call site is explicit
 * about going through {@link openDeckFromJson}; it adds no AI-specific parsing.
 */
export function openAiGeneratedDeck(raw: unknown): OpenDeckResult {
  return openDeckFromJson(raw);
}

/**
 * The three ways the editor can start, decided from a raw persisted candidate.
 *
 * - `blank`: there is genuinely no deck to open (null/undefined input), so the
 *   editor starts from an explicit, guarded blank deck.
 * - `open`: the candidate is a valid v7 deck (or a migratable v6 deck).
 * - `recovery`: the candidate is non-empty but could not be opened, so the
 *   editor must show a recovery surface with diagnostics — never a blank deck.
 */
export type DeckOpenDecision =
  | { mode: "blank" }
  | {
      mode: "open";
      deck: DeckV7;
      source: "v7" | "legacy-v6";
      diagnostics: PresentationDiagnostic[];
      idMap?: MigrationIdMap;
    }
  | {
      mode: "recovery";
      error: string;
      errors?: string[];
      diagnostics: PresentationDiagnostic[];
    };

/**
 * Decides how the editor should start from a raw persisted deck candidate.
 *
 * This is the guarded boundary that prevents invalid-but-non-empty deck JSON
 * from silently becoming a blank editor: only a genuinely absent candidate
 * (`null`/`undefined`) yields `blank`; any non-empty candidate that fails to
 * open yields `recovery` so the caller can surface diagnostics and let the user
 * choose a safe path (rather than overwriting their data with a blank deck).
 */
export function decideDeckOpen(raw: unknown): DeckOpenDecision {
  if (raw === null || raw === undefined) {
    return { mode: "blank" };
  }
  const result = openDeckFromJson(raw);
  if (result.ok) {
    return {
      mode: "open",
      deck: result.deck,
      source: result.source,
      diagnostics: result.diagnostics,
      idMap: result.idMap,
    };
  }
  return {
    mode: "recovery",
    error: result.error,
    errors: result.errors,
    diagnostics: result.diagnostics,
  };
}
