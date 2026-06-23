/**
 * Performance and size budgets for TextIQ (issue #461).
 *
 * This module centralises ALL performance-related constants so budget checks
 * are consistent across save paths, export preflight, and diagnostics. It
 * extends the existing limits in `deck-limits.ts` (re-exported here for
 * convenience) and adds new limits for document size, visual count, slide
 * count, asset count, and timing budgets.
 *
 * ## Budget levels
 *
 * Each budget has two tiers:
 *  - **warning**  — the limit is approached; log a structured warning so the
 *                   operator can act before hitting the hard cap.
 *  - **hard**     — the limit is breached; the operation must be rejected or
 *                   the warning must be surfaced prominently.
 *
 * Hard caps may not be changed without a separate product / architecture
 * decision. Warning thresholds are advisory.
 *
 * ## Connection to existing constants
 *
 * | Budget constant          | Existing source                            |
 * |--------------------------|--------------------------------------------|
 * | DECK_JSON_HARD_BYTES     | MAX_DECK_JSON_BYTES in deck-limits.ts      |
 * | LEXICAL_STATE_HARD_BYTES | MAX_LEXICAL_STATE_LENGTH in actions.ts     |
 * | CONTENT_HARD_BYTES       | MAX_CONTENT_LENGTH in actions.ts           |
 * | SLIDES_HARD_COUNT        | DEFAULT_MAX_SLIDES in export-preflight.ts  |
 */

// Re-export existing deck-limits so callers only need one import.
export {
  MAX_DECK_JSON_BYTES,
  DECK_JSON_NON_IMAGE_RESERVE,
} from "@/lib/presentation/deck-limits";

// ---------------------------------------------------------------------------
// Deck / slide budgets
// ---------------------------------------------------------------------------

/** Hard cap on the serialized deck JSON accepted by the server. */
export const DECK_JSON_HARD_BYTES = 500_000;

/** Warning threshold: 80 % of the hard cap. */
export const DECK_JSON_WARN_BYTES = Math.round(DECK_JSON_HARD_BYTES * 0.8);

/** Maximum number of slides the system supports reliably. */
export const SLIDES_HARD_COUNT = 50;

/** Warning threshold for slide count. */
export const SLIDES_WARN_COUNT = 40;

/** Maximum number of elements per slide. */
export const ELEMENTS_PER_SLIDE_HARD_COUNT = 100;

/** Warning threshold for elements per slide. */
export const ELEMENTS_PER_SLIDE_WARN_COUNT = 75;

// ---------------------------------------------------------------------------
// Document / Lexical state budgets
// ---------------------------------------------------------------------------

/**
 * Hard cap on the serialized Lexical state string accepted by the server.
 * Mirrors `MAX_LEXICAL_STATE_LENGTH` in `actions.ts`.
 */
export const LEXICAL_STATE_HARD_BYTES = 2_000_000;

/** Warning threshold for Lexical state size. */
export const LEXICAL_STATE_WARN_BYTES = Math.round(
  LEXICAL_STATE_HARD_BYTES * 0.8,
);

/**
 * Hard cap on the plain-text `content` field extracted from the Lexical state.
 * Mirrors `MAX_CONTENT_LENGTH` in `actions.ts`.
 */
export const CONTENT_HARD_BYTES = 100_000;

/** Warning threshold for plain-text content size. */
export const CONTENT_WARN_BYTES = Math.round(CONTENT_HARD_BYTES * 0.8);

// ---------------------------------------------------------------------------
// Visual budgets
// ---------------------------------------------------------------------------

/** Maximum number of Visual rows per document. */
export const VISUALS_PER_DOCUMENT_HARD_COUNT = 200;

/** Warning threshold for visual count. */
export const VISUALS_PER_DOCUMENT_WARN_COUNT = 150;

// ---------------------------------------------------------------------------
// Asset budgets
// ---------------------------------------------------------------------------

/**
 * Maximum size (bytes) of an inlined image data URL accepted by the server.
 * Derived: total deck budget minus non-image reserve.
 */
export const INLINE_IMAGE_HARD_BYTES = DECK_JSON_HARD_BYTES - 100_000; // = 400_000

/** Warning threshold for a single inlined image. */
export const INLINE_IMAGE_WARN_BYTES = Math.round(
  INLINE_IMAGE_HARD_BYTES * 0.75,
);

/** Maximum number of inlined images per deck. */
export const INLINE_IMAGES_HARD_COUNT = 20;

/** Warning threshold for inlined image count. */
export const INLINE_IMAGES_WARN_COUNT = 15;

// ---------------------------------------------------------------------------
// Timing budgets (ms) — advisory, not enforced in CI
// ---------------------------------------------------------------------------

/**
 * Target maximum time (ms) for a deck autosave round-trip (client to server
 * to response). Exceeding this does not block the save but should trigger a
 * warning diagnostic.
 */
export const AUTOSAVE_WARN_MS = 3_000;

/**
 * Target maximum time (ms) for export preflight to complete synchronously.
 * Pure in-process computation — should never approach this on realistic decks.
 */
export const EXPORT_PREFLIGHT_WARN_MS = 500;

/**
 * Target maximum time (ms) to open/hydrate a large document in the editor.
 * Measured from navigation to interactive state; advisory only.
 */
export const EDITOR_OPEN_WARN_MS = 2_000;

// ---------------------------------------------------------------------------
// Budget-check helpers
// ---------------------------------------------------------------------------

/** Result of a single budget check. */
export interface BudgetCheckResult {
  /** Name of the metric being checked. */
  metric: string;
  /** The value that was measured. */
  actual: number;
  /** The warning threshold. */
  warnAt: number;
  /** The hard limit. */
  hardAt: number;
  /** Whether the hard limit was breached. */
  exceeded: boolean;
  /** Whether the warning threshold was crossed (but hard limit is OK). */
  warned: boolean;
}

/**
 * Checks a measured value against warning and hard thresholds.
 *
 * @param metric  - Name of the metric (used in diagnostic output).
 * @param actual  - Measured value.
 * @param warnAt  - Warning threshold.
 * @param hardAt  - Hard limit.
 */
export function checkBudget(
  metric: string,
  actual: number,
  warnAt: number,
  hardAt: number,
): BudgetCheckResult {
  return {
    metric,
    actual,
    warnAt,
    hardAt,
    exceeded: actual > hardAt,
    warned: actual > warnAt && actual <= hardAt,
  };
}

/**
 * Check deck JSON size against the warning and hard thresholds.
 */
export function checkDeckJsonBudget(byteLength: number): BudgetCheckResult {
  return checkBudget(
    "deckJsonBytes",
    byteLength,
    DECK_JSON_WARN_BYTES,
    DECK_JSON_HARD_BYTES,
  );
}

/**
 * Check Lexical state size against the warning and hard thresholds.
 */
export function checkLexicalStateBudget(byteLength: number): BudgetCheckResult {
  return checkBudget(
    "lexicalStateBytes",
    byteLength,
    LEXICAL_STATE_WARN_BYTES,
    LEXICAL_STATE_HARD_BYTES,
  );
}

/**
 * Check slide count against the warning and hard thresholds.
 */
export function checkSlideCountBudget(count: number): BudgetCheckResult {
  return checkBudget("slideCount", count, SLIDES_WARN_COUNT, SLIDES_HARD_COUNT);
}

/**
 * Check visual count against the warning and hard thresholds.
 */
export function checkVisualCountBudget(count: number): BudgetCheckResult {
  return checkBudget(
    "visualCount",
    count,
    VISUALS_PER_DOCUMENT_WARN_COUNT,
    VISUALS_PER_DOCUMENT_HARD_COUNT,
  );
}

/**
 * Check inline image size against the warning and hard thresholds.
 */
export function checkInlineImageBudget(byteLength: number): BudgetCheckResult {
  return checkBudget(
    "inlineImageBytes",
    byteLength,
    INLINE_IMAGE_WARN_BYTES,
    INLINE_IMAGE_HARD_BYTES,
  );
}
