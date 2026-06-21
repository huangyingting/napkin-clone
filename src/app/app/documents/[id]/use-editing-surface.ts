"use client";

import { useEditorContext } from "@/lib/lexical/editor-context";
import {
  resolveEditingSurface,
  selectionKindFromContext,
  type ResolvedEditingSurface,
} from "@/lib/lexical/editing-surface";
import { useIsPointerFine, useIsWideViewport } from "@/lib/pointer";

import { useDockedPreference } from "./docked-preference";

/**
 * The React bridge to the pure {@link resolveEditingSurface} decision (epic #87,
 * item 3). It gathers the four runtime inputs — pointer fineness, viewport width
 * tier, the selection kind derived from the shared {@link useEditorContext}
 * snapshot, and the docked preference — and returns the single
 * `{ mode, group }` that every contextual editing surface renders from.
 *
 * This is the ONE place that decides which surface mode hosts which content
 * group; the floating text toolbar, the bottom sheet, and the (future) docked
 * rail all read from here instead of running their own ad-hoc visibility
 * checks. Selection is still derived only via {@link useEditorContext}, honouring
 * the #84 single-selection-derivation invariant.
 */
export function useEditingSurface(): ResolvedEditingSurface {
  const ctx = useEditorContext();
  const pointerFine = useIsPointerFine();
  const wide = useIsWideViewport();
  const dockedPreference = useDockedPreference();

  return resolveEditingSurface({
    pointerFine,
    widthTier: wide ? ">=lg" : "<lg",
    selectionKind: selectionKindFromContext(ctx.kind),
    dockedPreference,
  });
}
