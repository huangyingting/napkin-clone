/**
 * Public facade for pure, browser-free Visual → native PPTX shape descriptors.
 * Family-specific mappers live under pptx-shapes/ so callers keep a single
 * stable import path for `visualToNativeSpecs` and descriptor helpers.
 */

import type { Visual } from "@/lib/visual/schema";
import {
  specsConceptMap,
  specsFlowchart,
  specsMindMap,
  specsOrgChart,
  specsVenn,
} from "@/lib/visual/pptx-shapes/positioned";
import {
  specsChart,
  specsComparison,
  specsCycle,
  specsList,
  specsMatrix,
  specsTimeline,
} from "@/lib/visual/pptx-shapes/structured";
import type { PptxSlideLayout, PptxSpec } from "@/lib/visual/pptx-shapes/types";

export {
  computeVisualSlideLayout,
  toHex,
} from "@/lib/visual/pptx-shapes/shared";
export type {
  PptxDiamondSpec,
  PptxEllipseSpec,
  PptxHexagonSpec,
  PptxImageFallbackSpec,
  PptxLineSpec,
  PptxRectSpec,
  PptxSlideLayout,
  PptxSpec,
  PptxTextSpec,
} from "@/lib/visual/pptx-shapes/types";

/**
 * Converts a Visual into an array of PptxSpec descriptors ready to be applied
 * to a PptxGenJS slide.
 *
 * Returns `[{ kind: "image-fallback" }]` for visual kinds that cannot be
 * reasonably represented as native PowerPoint shapes.
 *
 * @param visual  The Visual to convert.
 * @param layout  Slide layout produced by {@link computeVisualSlideLayout}.
 */
export function visualToNativeSpecs(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
  switch (visual.type) {
    case "flowchart":
      return specsFlowchart(visual, layout);
    case "mindmap":
      return specsMindMap(visual, layout);
    case "concept":
      return specsConceptMap(visual, layout);
    case "orgchart":
      return specsOrgChart(visual, layout);
    case "venn":
      return specsVenn(visual, layout);
    case "list":
      return specsList(visual, layout);
    case "chart":
      return specsChart(visual, layout);
    case "timeline":
      return specsTimeline(visual, layout);
    case "cycle":
      return specsCycle(visual, layout);
    case "comparison":
      return specsComparison(visual, layout);
    case "matrix":
      return specsMatrix(visual, layout);
    case "funnel":
    case "pyramid":
      return [{ kind: "image-fallback" }];
    default:
      return [{ kind: "image-fallback" }];
  }
}

/** Whether the specs array represents an image-fallback (non-native) result. */
/* node:coverage ignore next -- Image-fallback true and false cases are asserted; tsx maps the helper declaration as uncovered. @preserve */
export const isImageFallback = (specs: PptxSpec[]): boolean =>
  specs.length === 1 && specs[0].kind === "image-fallback";
