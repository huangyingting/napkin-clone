/** Export support data for each visual kind. */

import type { VisualKind } from "@/lib/visual/schema";
import type { KindExportSupport } from "./registry-types";
import { KIND_RUNTIME_DESCRIPTORS } from "./registry-runtime";

/**
 * Full SVG/PNG/PDF export + PPTX as embedded raster (no native Office shapes).
 * Applicable to visual families whose mapper returns an image-fallback sentinel.
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
 */
const FULL_EXPORT: KindExportSupport = {
  svg: true,
  png: true,
  pdf: true,
  pptxNative: true,
  pptxRasterFallback: true,
  pptxDegradations: [],
};

function supportForKind(kind: VisualKind): KindExportSupport {
  const family = KIND_RUNTIME_DESCRIPTORS[kind].render.family;
  return family === "funnel" || family === "pyramid"
    ? RASTER_EXPORT
    : FULL_EXPORT;
}

export const KIND_EXPORT_SUPPORT = Object.fromEntries(
  (Object.keys(KIND_RUNTIME_DESCRIPTORS) as VisualKind[]).map((kind) => [
    kind,
    supportForKind(kind),
  ]),
) as Record<VisualKind, KindExportSupport>;
