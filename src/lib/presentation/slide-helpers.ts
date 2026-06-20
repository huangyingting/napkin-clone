/**
 * Pure helpers for the in-app Present mode.
 *
 * Intentionally free of DOM/React so they can be unit-tested under
 * `node --test`.
 */

/**
 * Clamps a slide index so it is always within [0, total − 1].
 * Returns 0 when `total` is 0 or negative (defensive).
 */
export function clampSlideIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(Math.floor(index), 0), total - 1);
}

/**
 * Formats a 1-based progress label such as "3 / 12".
 * `current` is zero-based; `total` is the deck length.
 * When `total` is 0 returns "0 / 0" (empty deck guard).
 */
export function formatProgress(current: number, total: number): string {
  if (total <= 0) return "0 / 0";
  const display = clampSlideIndex(current, total) + 1;
  return `${display} / ${total}`;
}
