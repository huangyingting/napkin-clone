"use client";

/**
 * React hook that resolves a `DeckV7` into a `ResolvedDeckRenderTree`.
 *
 * Wraps `resolveDeckRenderTree` in a `useMemo` so the resolved tree is only
 * recomputed when the deck or package identity changes.
 *
 * Rules:
 * - Returns `null` when `deck` is null or undefined.
 * - Falls back to `NEUTRAL_THEME_PACKAGE` when no package is supplied.
 * - The caller owns the resolved tree reference; the hook never mutates it.
 */

import { useMemo } from "react";

import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import type { ThemePackageV1 } from "@/lib/presentation-vnext/theme-package-schema";
import type { ResolvedDeckRenderTree } from "@/lib/presentation-vnext/render-tree";
import { resolveDeckRenderTree } from "@/lib/presentation-vnext/render-resolver";
import { NEUTRAL_THEME_PACKAGE } from "@/lib/presentation-vnext/neutral-theme-package";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDeckV7RenderTreeOptions {
  /**
   * Pixel width used for `framePx` calculations.
   * Defaults to 960 (matching the render-resolver default).
   */
  canvasWidthPx?: number;
  /**
   * Pixel height used for `framePx` calculations.
   * Defaults to 540.
   */
  canvasHeightPx?: number;
}

/**
 * Resolves a `DeckV7` into a `ResolvedDeckRenderTree`.
 *
 * @param deck       - The v7 deck to resolve, or null/undefined.
 * @param pkg        - Theme package to use. Defaults to the neutral package.
 * @param options    - Canvas pixel dimensions for frame resolution.
 * @returns The resolved render tree, or `null` when `deck` is absent.
 */
export function useDeckV7RenderTree(
  deck: DeckV7 | null | undefined,
  pkg?: ThemePackageV1 | null,
  options?: UseDeckV7RenderTreeOptions,
): ResolvedDeckRenderTree | null {
  const resolvedPkg = pkg ?? NEUTRAL_THEME_PACKAGE;
  const cw = options?.canvasWidthPx;
  const ch = options?.canvasHeightPx;

  return useMemo(() => {
    if (!deck) return null;
    return resolveDeckRenderTree(deck, resolvedPkg, {
      canvasWidthPx: cw,
      canvasHeightPx: ch,
    });
  }, [deck, resolvedPkg, cw, ch]);
}
