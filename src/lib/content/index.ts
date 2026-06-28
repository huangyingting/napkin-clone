/* node:coverage disable */
/* Content facade documentation and re-export wiring have no local runtime branch. */
/**
 * Shared content projection facade.
 *
 * This namespace owns the current document content view models: supported
 * Markdown parsing, Markdown → serialized Lexical conversion, serialized
 * Lexical → plain text, and serialized Lexical → rich document blocks.
 */

export { blockText, parseMarkdown } from "@/lib/content/markdown";
export type { MarkdownBlock } from "@/lib/content/markdown";

export {
  markdownToLexicalState,
  markdownToLexicalStateObject,
} from "@/lib/content/from-markdown";
export type { SerializedLexicalState } from "@/lib/content/from-markdown";

export {
  documentBlocksToPlainText,
  lexicalStateToPlainText,
} from "@/lib/content/plain-text";
export type { PlainTextProjectionOptions } from "@/lib/content/plain-text";

export {
  /* node:coverage ignore next 5 -- Document block facade re-export rows are import wiring. */
  blockRichText,
  collectDocumentBlocks,
  computePageBreaks,
  PAGE_SIZE_DIMENSIONS,
} from "@/lib/content/document-blocks";
/* node:coverage ignore next 7 -- Document block type facade exports are erased by tsx. */
export type {
  DocumentBlock,
  DocumentTextBlock,
  DocumentVisualBlock,
  PageSize,
  TextBlockKind,
} from "@/lib/content/document-blocks";

export {
  /* node:coverage ignore next 8 -- Import-persistence facade re-export rows are import wiring. */
  BLOCK_ID_REPAIR_TAG,
  IMPORT_TAG,
  RESTORE_TAG,
  importRequiresConfirmation,
  resolveImportStep,
  shouldAutosaveUpdate,
} from "@/lib/content/import-persistence";
/* node:coverage ignore next -- Re-enabling coverage marker has no runtime branch. */
/* node:coverage enable */
