/**
 * Registry-derived export support matrices and AI prompt constraints (#447).
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 *  - Which visual kinds support which export formats (SVG, PNG, PDF, PPTX)
 *  - AI prompt kind guidance strings
 *
 * All values are derived from {@link VISUAL_KIND_REGISTRY} — do NOT add
 * new hardcoded lists here; extend the registry entry instead.
 *
 * The export-fidelity and AI prompt layers read from these helpers so that
 * adding a new kind in the registry automatically propagates to both.
 */

import { VISUAL_KINDS, type VisualKind } from "@/lib/visual/schema";
import {
  VISUAL_KIND_REGISTRY,
  getKindEntry,
  type KindExportSupport,
} from "@/lib/visual/registry";

// ---------------------------------------------------------------------------
// Export format types
// ---------------------------------------------------------------------------

export type ExportFormat =
  | "svg"
  | "png"
  | "pdf"
  | "pptx-native"
  | "pptx-raster";

// ---------------------------------------------------------------------------
// Export support matrix
// ---------------------------------------------------------------------------

/**
 * One row of the export support matrix: which formats a visual kind supports.
 */
export interface KindExportSupportRow {
  kind: VisualKind;
  svg: boolean;
  png: boolean;
  pdf: boolean;
  /** PPTX export using native Office shapes (fully editable in Office). */
  pptxNative: boolean;
  /**
   * PPTX export as embedded raster image (opens in Office but not editable
   * as native shapes).
   */
  pptxRasterFallback: boolean;
  /**
   * Features that degrade or are lost in PPTX export for this kind.
   * Empty array = no known degradations.
   */
  pptxDegradations: readonly string[];
}

/**
 * Derives the complete export support matrix from the registry.
 *
 * Returns one {@link KindExportSupportRow} per visual kind. Adding a new kind
 * to the registry automatically includes it in the matrix — no separate list
 * to maintain.
 */
export function buildKindExportMatrix(): KindExportSupportRow[] {
  return VISUAL_KINDS.map((kind) => {
    const exp: KindExportSupport = VISUAL_KIND_REGISTRY[kind].export;
    return {
      kind,
      svg: exp.svg,
      png: exp.png,
      pdf: exp.pdf,
      pptxNative: exp.pptxNative,
      pptxRasterFallback: exp.pptxRasterFallback,
      pptxDegradations: exp.pptxDegradations,
    };
  });
}

/**
 * Returns the {@link KindExportSupportRow} for a specific kind.
 */
export function getKindExportSupport(kind: VisualKind): KindExportSupportRow {
  const exp: KindExportSupport = getKindEntry(kind).export;
  return {
    kind,
    svg: exp.svg,
    png: exp.png,
    pdf: exp.pdf,
    pptxNative: exp.pptxNative,
    pptxRasterFallback: exp.pptxRasterFallback,
    pptxDegradations: exp.pptxDegradations,
  };
}

/**
 * Returns all kinds that support the given export format.
 */
export function getKindsForFormat(format: ExportFormat): VisualKind[] {
  return VISUAL_KINDS.filter((kind) => {
    const exp = VISUAL_KIND_REGISTRY[kind].export;
    switch (format) {
      case "svg":
        return exp.svg;
      case "png":
        return exp.png;
      case "pdf":
        return exp.pdf;
      case "pptx-native":
        return exp.pptxNative;
      case "pptx-raster":
        return exp.pptxRasterFallback;
    }
  });
}

/**
 * Returns `true` when the kind supports the given export format.
 */
export function kindSupportsFormat(
  kind: VisualKind,
  format: ExportFormat,
): boolean {
  const exp = VISUAL_KIND_REGISTRY[kind].export;
  switch (format) {
    case "svg":
      return exp.svg;
    case "png":
      return exp.png;
    case "pdf":
      return exp.pdf;
    case "pptx-native":
      return exp.pptxNative;
    case "pptx-raster":
      return exp.pptxRasterFallback;
  }
}

// ---------------------------------------------------------------------------
// AI prompt kind constraints derived from registry
// ---------------------------------------------------------------------------

/**
 * A compact, AI-friendly description of a visual kind's constraints.
 * Used to build the generation system prompt without dumping raw registry
 * internals into it.
 */
export interface KindPromptEntry {
  kind: VisualKind;
  /** The guidance string injected into the generation prompt. */
  guidance: string;
  /** Whether nodes must carry `value` for this kind. */
  requiresNodeValue: boolean;
  /** Whether x/y node positions are expected in generated output. */
  requiresNodePosition: boolean;
  /** Whether edges are semantically meaningful for this kind. */
  edgesRelevant: boolean;
}

/**
 * Derives the complete AI prompt constraints table from the registry.
 *
 * The prompt builder in `@/lib/ai/prompt.ts` should call this instead of
 * maintaining a separate `KIND_GUIDANCE` map — the registry is the single
 * source of truth.
 */
export function buildKindPromptConstraints(): KindPromptEntry[] {
  return VISUAL_KINDS.map((kind) => {
    const entry = getKindEntry(kind);
    return {
      kind,
      guidance: entry.prompt.guidance,
      requiresNodeValue: entry.prompt.requiresNodeValue,
      requiresNodePosition: entry.prompt.requiresNodePosition,
      edgesRelevant: entry.prompt.edgesRelevant,
    };
  });
}

/**
 * Returns the {@link KindPromptEntry} for a specific kind.
 */
export function getKindPromptEntry(kind: VisualKind): KindPromptEntry {
  const entry = getKindEntry(kind);
  return {
    kind,
    guidance: entry.prompt.guidance,
    requiresNodeValue: entry.prompt.requiresNodeValue,
    requiresNodePosition: entry.prompt.requiresNodePosition,
    edgesRelevant: entry.prompt.edgesRelevant,
  };
}

/**
 * Builds the KIND_GUIDANCE record in the shape expected by the AI prompt
 * system — a plain `Record<VisualKind, string>`.
 *
 * Drop-in replacement for the hardcoded `KIND_GUIDANCE` constant in
 * `@/lib/ai/prompt.ts`.
 */
export function buildKindGuidanceRecord(): Record<VisualKind, string> {
  return Object.fromEntries(
    VISUAL_KINDS.map((kind) => [kind, getKindEntry(kind).prompt.guidance]),
  ) as Record<VisualKind, string>;
}

// ---------------------------------------------------------------------------
// Exhaustiveness guard
// ---------------------------------------------------------------------------

/**
 * Asserts that every registered kind has explicit export capability decisions
 * and AI prompt guidance. Fails fast in tests when a kind is added without
 * completing its registry entry.
 */
export function assertSupportMatricesComplete(): void {
  for (const kind of VISUAL_KINDS) {
    const entry = getKindEntry(kind);

    // Export support
    const exp = entry.export;
    // At minimum png must be supported (all kinds can be rasterised)
    if (!exp.png) {
      throw new Error(
        `[support-matrices] Kind "${kind}" does not support PNG export — update the registry entry`,
      );
    }

    // Prompt constraints
    if (!entry.prompt.guidance) {
      throw new Error(
        `[support-matrices] Kind "${kind}" is missing AI prompt guidance — update the registry entry`,
      );
    }
  }
}
