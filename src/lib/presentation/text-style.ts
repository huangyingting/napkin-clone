/**
 * Pure, DOM-free helpers shared by the slide editor's text-style and color
 * controls (the on-canvas `ElementToolbar`, the inspector `TextStyleControls`,
 * and the Style-tab background/accent overrides).
 *
 * Keeping the font-size clamp/step math and the theme→swatch color mapping here
 * lets a single source drive every control identically and keeps the logic
 * unit-testable without React.
 */

import type { ElementAlign } from "./deck";

/** Lower bound for a text element's font size (percent of slide height). */
export const FONT_MIN = 2;
/** Upper bound for a text element's font size (percent of slide height). */
export const FONT_MAX = 24;
/** Increment used by the font-size stepper. */
export const FONT_STEP = 0.5;

/** The three alignment options, in display order. */
export const ALIGN_OPTIONS: readonly ElementAlign[] = [
  "left",
  "center",
  "right",
];

/**
 * Snaps a font size to the nearest {@link FONT_STEP} increment and clamps it to
 * the [{@link FONT_MIN}, {@link FONT_MAX}] range. Non-finite input falls back to
 * {@link FONT_MIN}.
 */
export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return FONT_MIN;
  }
  const stepped = Math.round(value / FONT_STEP) * FONT_STEP;
  return Math.max(FONT_MIN, Math.min(FONT_MAX, stepped));
}

/**
 * Returns the font size after applying `delta`, snapped and clamped via
 * {@link clampFontSize}. Used by the +/- stepper in both editor surfaces.
 */
export function stepFontSize(current: number, delta: number): number {
  return clampFontSize(current + delta);
}

/**
 * Extracts a deduped, ordered list of preset colors from a theme record for a
 * given color key (e.g. `"accentColor"` or `"bgColor"`). Drives the deck-theme
 * swatch chips so the Style-tab overrides default to on-theme colors before any
 * custom value. Comparison is case-insensitive; the first-seen casing wins.
 */
export function themeSwatchColors<T extends Record<string, unknown>>(
  themes: Record<string, T>,
  key: keyof T,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const config of Object.values(themes)) {
    const color = config[key];
    if (typeof color === "string") {
      const lower = color.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        out.push(color);
      }
    }
  }
  return out;
}

/**
 * Extracts a deduped, ordered list of colors from deck theme token sets. The
 * slide inspector uses this for built-in background/accent swatches so theme
 * chips stay coupled to the authoritative token cascade.
 */
export function tokenSetSwatchColors<K extends string>(
  tokenSets: readonly { colors: Partial<Record<K, string>> }[],
  key: K,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tokenSet of tokenSets) {
    const color = tokenSet.colors[key];
    if (typeof color === "string") {
      const lower = color.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        out.push(color);
      }
    }
  }
  return out;
}

/**
 * Merges swatch lists in priority order, deduping by lowercased value (the
 * first-seen casing wins). Used to surface a user's brand-kit colors ahead of
 * the on-theme / default swatches in the editor's color pickers. Non-string
 * entries are skipped so callers can splat sparse brand fields directly.
 */
export function mergeSwatches(
  ...lists: ReadonlyArray<readonly (string | null | undefined)[] | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const color of list) {
      if (typeof color !== "string") continue;
      const lower = color.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(color);
    }
  }
  return out;
}
