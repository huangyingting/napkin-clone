/** Persisted visual-level export/frame preference validation. */

import {
  isAspectRatioPreset,
  isCanvasStyle,
  type AspectRatioPreset,
  type CanvasStyle,
} from "@/lib/visual/schema-types";

export interface VisualExportOptionsParseResult {
  aspectRatio?: AspectRatioPreset;
  canvasStyle?: CanvasStyle;
}

export function parseVisualExportOptions(
  input: Record<string, unknown>,
): VisualExportOptionsParseResult {
  return {
    ...(isAspectRatioPreset(input.aspectRatio)
      ? { aspectRatio: input.aspectRatio }
      : {}),
    ...(isCanvasStyle(input.canvasStyle)
      ? { canvasStyle: input.canvasStyle }
      : {}),
  };
}
