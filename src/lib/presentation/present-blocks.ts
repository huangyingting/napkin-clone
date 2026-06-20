/**
 * Utilities for building the `DocumentBlock[]` list that feeds
 * `buildDeckFromBlocks` in the public presentation routes.
 *
 * Two distinct document shapes exist in the wild:
 *  - **Lexical documents** — `contentJson` holds the full serialised editor
 *    state; `collectDocumentBlocks` extracts blocks from it.
 *  - **Legacy / imported documents** — only `content` (Markdown) is stored;
 *    `contentJson` is null/empty until the document is opened and saved in the
 *    Lexical editor.
 *
 * `buildPresentationBlocks` encapsulates the fallback logic so that both
 * present routes can share a single, testable code path.
 *
 * Note: `contentJson` is typed as `unknown` to accept Prisma's `JsonValue`
 * directly — `collectDocumentBlocks` already handles the full `unknown` →
 * `DocumentBlock[]` narrowing internally.
 */

import type { DocumentBlock } from "@/lib/visual/document-export";
import { collectDocumentBlocks } from "@/lib/visual/document-export";
import { parseMarkdown } from "@/lib/markdown";

/**
 * Converts a Markdown string (already parsed by `parseMarkdown`) into the
 * `DocumentBlock[]` format expected by `buildDeckFromBlocks`.
 *
 * Mapping rules:
 *  - `heading` → `text / heading` (level preserved)
 *  - `paragraph` → `text / paragraph`
 *  - `bullets` → one `text / listitem` per bullet item
 */
export function markdownToDocumentBlocks(markdown: string): DocumentBlock[] {
  const blocks = parseMarkdown(markdown);
  const out: DocumentBlock[] = [];

  for (const block of blocks) {
    if (block.kind === "heading") {
      out.push({
        kind: "text",
        blockType: "heading",
        level: block.level,
        text: block.text,
      });
    } else if (block.kind === "paragraph") {
      out.push({ kind: "text", blockType: "paragraph", text: block.text });
    } else if (block.kind === "bullets") {
      for (const item of block.items) {
        out.push({ kind: "text", blockType: "listitem", text: item });
      }
    }
  }

  return out;
}

/**
 * Returns the `DocumentBlock[]` list to use for building a presentation deck.
 *
 * Priority:
 *  1. `contentJson` — if present and non-empty, parse via `collectDocumentBlocks`.
 *  2. `content` — if `contentJson` is absent/empty, convert Markdown via
 *     `markdownToDocumentBlocks`.
 *  3. Empty array — when neither source is available.
 *
 * This is the single source of truth for the fallback logic; both
 * `/present/[shareId]` and `/present/[shareId]/embed` must call it.
 */
export function buildPresentationBlocks(
  contentJson: unknown,
  content: string | null | undefined,
): DocumentBlock[] {
  if (contentJson) {
    const blocks = collectDocumentBlocks(contentJson);
    if (blocks.length > 0) return blocks;
  }

  if (content) {
    return markdownToDocumentBlocks(content);
  }

  return [];
}
