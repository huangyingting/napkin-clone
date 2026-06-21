/**
 * The single, pure decision source for the editor's contextual editing
 * surfaces (epic #87, item 3 — "Unified EditingSurface").
 *
 * DOM-free and React-free, so it can be exercised headlessly under
 * `node --test`. The React bridge ({@link use-editing-surface.ts}) gathers the
 * runtime inputs (pointer fineness, viewport width tier, the selection kind from
 * {@link useEditorContext}, and the docked preference) and feeds them here; every
 * surface then renders from the returned `{ mode, group }` instead of running
 * its own ad-hoc visibility checks. This keeps the #84 invariant intact: there
 * is exactly one place that turns "what is selected + where are we" into "which
 * surface shows which content".
 *
 * The function is TOTAL over its 2 × 2 × 3 × 2 = 24 input combinations and is
 * exhaustively pinned by {@link editing-surface.test.ts}.
 */

import type { EditorContextKind } from "./editor-context";

/**
 * How the contextual editing content is presented:
 * - `"float"` — an anchored {@link FloatingSurface} popped over the selection
 *   (fine pointers). Keeps the #124 anchored-position math.
 * - `"sheet"` — the slide-up bottom sheet (coarse pointers).
 * - `"docked"` — a persistent right-side rail (desktop width + docked
 *   preference; also hosts the document-level overall toolbox at ≥ lg).
 * - `"none"` — nothing is shown (the `group` is still returned so callers know
 *   what *would* render).
 */
export type EditingSurfaceMode = "float" | "sheet" | "docked" | "none";

/**
 * Which content group a surface should host. This is purely selection-derived
 * (see {@link selectionKindFromContext}):
 * - `"text-format"` ← a non-collapsed text range
 * - `"visual-edit"` ← a selected VisualNode
 * - `"overall"` ← no element selection (document-level adjustments)
 */
export type EditingSurfaceGroup = "text-format" | "visual-edit" | "overall";

/** The selection kinds the resolver distinguishes (a projection of {@link EditorContextKind}). */
export type EditingSurfaceSelectionKind = "range" | "visual" | "none";

/** The viewport width tier (matchMedia `(min-width: 1024px)` — Tailwind `lg`). */
export type EditingSurfaceWidthTier = ">=lg" | "<lg";

/**
 * Whether the user prefers the persistent docked rail. Defaults to `"off"`
 * until a sibling PR adds the toggle UI + localStorage persistence; with
 * `"off"` the resolver reproduces today's float/sheet behaviour exactly.
 */
export type DockedPreference = "on" | "off";

export type ResolveEditingSurfaceInput = {
  pointerFine: boolean;
  widthTier: EditingSurfaceWidthTier;
  selectionKind: EditingSurfaceSelectionKind;
  dockedPreference: DockedPreference;
};

export type ResolvedEditingSurface = {
  mode: EditingSurfaceMode;
  group: EditingSurfaceGroup;
};

/**
 * Maps a raw {@link EditorContextKind} to the coarser
 * {@link EditingSurfaceSelectionKind} the resolver reasons about:
 * - `"range"` → `"range"`
 * - `"visual"` → `"visual"`
 * - everything else (`"none"`, `"empty-block"`, `"collapsed"`) → `"none"`
 *
 * Pure: no DOM, no React. Keeps selection derivation centralised so callers
 * never re-implement the mapping.
 */
export function selectionKindFromContext(
  kind: EditorContextKind,
): EditingSurfaceSelectionKind {
  if (kind === "range") return "range";
  if (kind === "visual") return "visual";
  return "none";
}

/**
 * Derives the content group from a selection kind. Exposed so callers that
 * already have a {@link EditingSurfaceSelectionKind} can label content without
 * re-deriving the full surface decision.
 */
export function groupForSelectionKind(
  selectionKind: EditingSurfaceSelectionKind,
): EditingSurfaceGroup {
  if (selectionKind === "range") return "text-format";
  if (selectionKind === "visual") return "visual-edit";
  return "overall";
}

/**
 * The single decision: given the pointer, width tier, selection kind, and
 * docked preference, return which surface `mode` hosts which content `group`.
 *
 * Precedence (encoded in this exact order):
 * - **R1**: `dockedPreference === "on"` AND `widthTier === ">=lg"` → `"docked"`
 *   for ALL selection kinds.
 * - **R2**: `dockedPreference === "on"` AND `widthTier === "<lg"` → the
 *   preference is ignored; fall through to R3/R4.
 * - **R3**: `selectionKind ∈ {range, visual}` → `pointerFine ? "float" : "sheet"`.
 * - **R4**: `selectionKind === "none"` → `widthTier === ">=lg" ? "docked" : "none"`.
 *
 * The `group` is always returned (even when `mode === "none"`) so callers know
 * what would render.
 */
export function resolveEditingSurface({
  pointerFine,
  widthTier,
  selectionKind,
  dockedPreference,
}: ResolveEditingSurfaceInput): ResolvedEditingSurface {
  const group = groupForSelectionKind(selectionKind);

  // R1 — docked preference wins at desktop width, for every selection kind.
  if (dockedPreference === "on" && widthTier === ">=lg") {
    return { mode: "docked", group };
  }

  // R2 — docked preference below lg is ignored; fall through to R3/R4.

  // R3 — an element selection floats (fine pointer) or sheets (coarse pointer).
  if (selectionKind === "range" || selectionKind === "visual") {
    return { mode: pointerFine ? "float" : "sheet", group };
  }

  // R4 — no element selection: the overall toolbox docks at ≥ lg, else nothing.
  return { mode: widthTier === ">=lg" ? "docked" : "none", group };
}
