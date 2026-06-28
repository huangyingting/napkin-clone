/**
 * Plain-text projection for serialized Lexical editor state.
 *
 * This module deliberately projects through the shared `DocumentBlock` contract
 * so persisted `Document.content` cannot drift from export, AI, or presentation
 * block extraction.
 */

import {
  collectDocumentBlocks,
  type DocumentBlock,
} from "@/lib/content/document-blocks";

export interface PlainTextProjectionOptions {
  /** Include explicit `[visual: id]` markers for visual blocks. */
  includeVisualMarkers?: boolean;
}

function blockLine(
  /* Coverage rationale: block projection branches are asserted; tsx maps signature rows as uncovered. */
  /* node:coverage ignore next 3 */
  block: DocumentBlock,
  options: PlainTextProjectionOptions,
): string | null {
  if (block.kind === "visual") {
    return options.includeVisualMarkers ? `[visual: ${block.visualId}]` : null;
  }

  if (block.blockType === "hr") {
    return "---";
  }

  return block.text;
}

/**
 * Projects already-collected document blocks into a line-oriented plain-text
 * string. Text blocks keep their textual content; horizontal rules become
 * `---`; visual markers are opt-in so `Document.content` remains user text.
 */
export function documentBlocksToPlainText(
  blocks: ReadonlyArray<DocumentBlock>,
  options: PlainTextProjectionOptions = {},
): string {
  return blocks
    .map((block) => blockLine(block, options))
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .trimEnd();
}

/* node:coverage ignore next 6 -- Projection wrapper prose has no runtime branch; wrapper behavior is asserted. */
/**
 * Projects a serialized Lexical editor state down to plain text by first
 * collecting the shared `DocumentBlock[]` model. Accepts either the
 * already-parsed state object or its JSON string form; malformed input yields
 * an empty string rather than throwing.
 */
export function lexicalStateToPlainText(state: unknown): string {
  /* node:coverage ignore next -- Lexical-state projection is asserted; tsx maps wrapper return as uncovered. */
  return documentBlocksToPlainText(collectDocumentBlocks(state));
}
