/** Export support data for each visual kind. */

import type { VisualKind } from "@/lib/visual/schema";
import type { KindExportSupport } from "./registry-types";

/**
 * Full SVG/PNG/PDF export + PPTX as embedded raster (no native Office shapes).
 * Applicable to the majority of derived-layout diagram kinds.
 */
const RASTER_EXPORT: KindExportSupport = {
  svg: true,
  png: true,
  pdf: true,
  pptxNative: false,
  pptxRasterFallback: true,
  pptxDegradations: ["pptx-shapes-not-editable-in-office"],
};

/**
 * Full SVG/PNG/PDF/PPTX native export.
 * Currently only positioned graph kinds (flowchart, mindmap, concept, orgchart)
 * render to native Office shapes via pptx-shapes.ts.
 */
const FULL_EXPORT: KindExportSupport = {
  svg: true,
  png: true,
  pdf: true,
  pptxNative: true,
  pptxRasterFallback: true,
  pptxDegradations: [],
};

export const KIND_EXPORT_SUPPORT = {
  flowchart: FULL_EXPORT,
  mindmap: FULL_EXPORT,
  list: RASTER_EXPORT,
  chart: RASTER_EXPORT,
  concept: FULL_EXPORT,
  timeline: RASTER_EXPORT,
  cycle: RASTER_EXPORT,
  comparison: RASTER_EXPORT,
  funnel: RASTER_EXPORT,
  venn: RASTER_EXPORT,
  pyramid: RASTER_EXPORT,
  matrix: RASTER_EXPORT,
  orgchart: FULL_EXPORT,
} satisfies Record<VisualKind, KindExportSupport>;
