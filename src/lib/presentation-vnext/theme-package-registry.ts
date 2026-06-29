/**
 * Runtime ThemePackageV1 registry.
 *
 * `resolveThemePackage` is the single lookup point for mapping a
 * `ThemePackageId` string to a `ThemePackageV1` at the editor, present-mode,
 * and public-render boundaries.
 *
 * Contract:
 *   - "neutral" always resolves to `NEUTRAL_THEME_PACKAGE` with no diagnostic.
 *   - Any unknown id resolves to `NEUTRAL_THEME_PACKAGE` with a diagnostic so
 *     callers can surface the issue without crashing.
 *   - All packages in the registry are pre-validated; callers receive a ready
 *     `ThemePackageV1` instance.
 */

import type { ThemePackageV1 } from "./theme-package-schema";
import { NEUTRAL_THEME_PACKAGE } from "./neutral-theme-package";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ThemeResolutionResult = {
  /** The resolved theme package (always non-null; falls back to neutral). */
  pkg: ThemePackageV1;
  /**
   * Human-readable diagnostic message when the requested package id was not
   * found in the registry.  Absent when resolution succeeded without fallback.
   */
  diagnostic?: string;
};

// ---------------------------------------------------------------------------
// Registry map
// ---------------------------------------------------------------------------

/**
 * The runtime registry.  Keys are `ThemePackageId` strings; values are
 * pre-validated `ThemePackageV1` instances.
 *
 * Only the built-in "neutral" package is registered here.  Future slice work
 * can import generated/prototype packages and add them to this map, provided
 * those packages pass `validateThemePackage` at module initialisation time.
 */
const REGISTRY = new Map<string, ThemePackageV1>([
  [NEUTRAL_THEME_PACKAGE.id, NEUTRAL_THEME_PACKAGE],
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a theme package id to a `ThemePackageV1`.
 *
 * @param packageId - The `ThemePackageId` stored in `DeckV7.theme.packageId`.
 * @returns `{ pkg }` when the id is found; `{ pkg, diagnostic }` when it is
 *   not found and the neutral fallback is used instead.
 */
export function resolveThemePackage(packageId: string): ThemeResolutionResult {
  const pkg = REGISTRY.get(packageId);
  if (pkg) {
    return { pkg };
  }
  return {
    pkg: NEUTRAL_THEME_PACKAGE,
    diagnostic: `Theme package "${packageId}" is not registered; using neutral fallback.`,
  };
}

/**
 * Returns every package id currently registered.
 * Useful for diagnostics and inspector UIs.
 */
export function registeredThemePackageIds(): string[] {
  return Array.from(REGISTRY.keys());
}
