/**
 * Pure validation helpers for slide comment anchor geometry.
 *
 * These helpers have no I/O dependencies and are fully testable under
 * `node --test`. They are consumed by `comments-actions.ts` at the
 * server-action boundary to reject or sanitize malformed anchor data.
 */

import type { AnchorPoint } from "@/lib/presentation/slide-comment-anchors";

// Inclusive coordinate range for percent-based anchor geometry.
const COORD_MIN = 0;
const COORD_MAX = 100;

/**
 * Validates raw anchor geometry input from a server-action caller.
 *
 * Returns a clean {@link AnchorPoint} when the input has valid `x` and `y`
 * numbers in the 0–100 percent range. Returns `null` when the input is
 * null/undefined. Throws when the input is present but malformed or
 * out-of-range — the caller should surface this as a bad-request error.
 */
export function validateAnchorGeometry(
  raw: { x: unknown; y: unknown } | null | undefined,
): AnchorPoint | null {
  if (raw == null) {
    return null;
  }

  if (typeof raw.x !== "number" || typeof raw.y !== "number") {
    throw new Error("Anchor geometry must have numeric x and y coordinates.");
  }

  if (
    raw.x < COORD_MIN ||
    raw.x > COORD_MAX ||
    raw.y < COORD_MIN ||
    raw.y > COORD_MAX
  ) {
    throw new Error(
      `Anchor geometry coordinates must be between ${COORD_MIN} and ${COORD_MAX}.`,
    );
  }

  return { x: raw.x, y: raw.y };
}

/**
 * Sanitizes raw anchor geometry, silently discarding values that are
 * non-numeric or out of range rather than throwing.
 *
 * Used at the DB-read boundary (in addition to `commentAnchorFromRecord`)
 * where data may have been written by an older client. Returns `null` for
 * any invalid input.
 */
export function sanitizeAnchorGeometry(raw: unknown): AnchorPoint | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const g = raw as { x?: unknown; y?: unknown };
  if (typeof g.x !== "number" || typeof g.y !== "number") {
    return null;
  }
  if (
    g.x < COORD_MIN ||
    g.x > COORD_MAX ||
    g.y < COORD_MIN ||
    g.y > COORD_MAX
  ) {
    return null;
  }
  return { x: g.x, y: g.y };
}

/**
 * Validates a slide ID string. Returns a trimmed non-empty string or null.
 * Throws when the value is present but not a string.
 */
export function validateSlideId(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new Error("slideId must be a string.");
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validates an element ID string. Returns a trimmed non-empty string or null.
 * Throws when the value is present but not a string.
 */
export function validateElementId(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new Error("elementId must be a string.");
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
