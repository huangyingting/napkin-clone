/**
 * Public document export facade.
 *
 * Browser-only PDF/PPTX/infographic rendering lives in
 * document-export-targets. The shared content projection contract lives under
 * `@/lib/content` and is re-exported here only for legacy callers.
 */

export {
  blockRichText,
  collectDocumentBlocks,
  computePageBreaks,
  PAGE_SIZE_DIMENSIONS,
} from "@/lib/content";
export type {
  DocumentBlock,
  DocumentTextBlock,
  DocumentVisualBlock,
  PageSize,
  TextBlockKind,
} from "@/lib/content";
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
