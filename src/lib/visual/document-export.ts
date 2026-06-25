/**
 * Public document export facade.
 *
 * `collectDocumentBlocks` and `blockRichText` remain the stable pure boundary;
 * browser-only PDF/PPTX/infographic rendering lives in document-export-targets.
 */

export {
  blockRichText,
  collectDocumentBlocks,
  computePageBreaks,
  PAGE_SIZE_DIMENSIONS,
} from "@/lib/visual/document-blocks";
export type {
  DocumentBlock,
  DocumentTextBlock,
  DocumentVisualBlock,
  PageSize,
  TextBlockKind,
} from "@/lib/visual/document-blocks";
export {
  exportDocumentAsInfographic,
  exportDocumentAsPDF,
  exportDocumentAsPPTX,
} from "@/lib/visual/document-export-targets";
export type { InfographicExportOptions } from "@/lib/visual/document-export-targets";
export {
  INFOGRAPHIC_WIDTH_PRESETS,
  type InfographicWidthPreset,
} from "@/lib/visual/infographic-layout";
