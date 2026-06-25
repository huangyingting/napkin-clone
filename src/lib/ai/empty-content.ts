/**
 * Pure, DOM-free guard for detecting an effectively-empty Lexical editor state
 * before offering or invoking AI deck generation (issue #280).
 *
 * The slide-editor open flow captures the LIVE Lexical editor state. When the
 * editor hasn't finished seeding (collab degraded/connecting; the
 * `LocalFallbackSeedPlugin` seeds via a deferred `queueMicrotask` — issue #257),
 * that snapshot is the EMPTY initial state, which makes `/api/generate-deck`
 * compute an empty outline and return 400. This helper lets callers detect that
 * case up front (and prefer a non-empty saved/initial snapshot instead).
 *
 * Kept React-/DOM-free (no `"use client"`, no `react` import) so it can be
 * exercised headlessly under `node --test`. It reuses the existing
 * {@link collectDocumentBlocks} walk so its notion of "content" matches what the
 * deck-generation route derives its outline from.
 */

import { collectDocumentBlocks } from "@/lib/content";

/**
 * True when a serialised Lexical editor state carries no meaningful content:
 * an empty root (no children), only empty/whitespace-only text blocks (e.g. the
 * initial empty paragraph), or malformed JSON (treated as empty). A document
 * with any visual block, or any text block with non-whitespace text, is NOT
 * empty.
 *
 * This is intentionally cheap: it walks the already-parsed block list once and
 * stops at the first piece of real content.
 */
export function isEffectivelyEmptyEditorState(serializedJson: string): boolean {
  const blocks = collectDocumentBlocks(serializedJson);
  if (blocks.length === 0) {
    return true;
  }
  return blocks.every(
    (block) => block.kind === "text" && block.text.trim().length === 0,
  );
}
