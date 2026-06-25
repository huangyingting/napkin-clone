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
  blockRichText,
  collectDocumentBlocks,
  computePageBreaks,
  PAGE_SIZE_DIMENSIONS,
} from "@/lib/content/document-blocks";
export type {
  DocumentBlock,
  DocumentTextBlock,
  DocumentVisualBlock,
  PageSize,
  TextBlockKind,
} from "@/lib/content/document-blocks";

export {
  BLOCK_ID_REPAIR_TAG,
  IMPORT_TAG,
  RESTORE_TAG,
  importRequiresConfirmation,
  resolveImportStep,
  shouldAutosaveUpdate,
} from "@/lib/content/import-persistence";
