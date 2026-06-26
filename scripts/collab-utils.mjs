/**
 * Shared low-level utilities for the collaboration plain-Node entry points.
 *
 * Kept dependency-free so every collab script can import from here without
 * pulling in the TypeScript app boundary.
 */

/**
 * Parses a positive integer from a raw value (string, number, or undefined).
 * Missing, blank, non-numeric, zero, and negative values all return `fallback`.
 *
 * @param {unknown} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function readPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
