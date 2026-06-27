/**
 * Deterministic content-hash helpers for {@link DocumentBlock}s.
 *
 * These are the building blocks for element-level source provenance
 * (issue #377). When a user inserts a document block onto a slide the
 * insertion path stamps a `contentHash` on the resulting `sourceRef` so
 * that later edits to the source document can be detected without a
 * full deck re-derive.
 *
 * Design decisions:
 *  - Uses the same FNV-1a 32-bit implementation already exported by
 *    `deck-hash.ts` — identical in Node and the browser, zero extra deps.
 *  - The signature encodes the block type, text, and (where present) the
 *    heading level with ASCII record-separator characters so distinct fields
 *    can never accidentally produce the same string.
 *  - Visual blocks are identified solely by `visualId`; their content hash
 *    tracks visual identity rather than payload bytes, matching visual element
 *    references in the deck model.
 */

import type { DocumentBlock } from "@/lib/content";
import { fnv1aHex } from "./deck-hash";

/**
 * Returns the canonical string representation of a document block that is
 * fed into the FNV-1a hash. Stable across runtimes and serialisation
 * round-trips as long as the block's `text`, `blockType`, and `level`
 * fields are unchanged.
 */
export function documentBlockSignature(block: DocumentBlock): string {
  if (block.kind === "visual") {
    return `visual\x02${block.visualId}`;
  }
  const parts: string[] = [
    `type\x01${block.blockType}`,
    `text\x01${block.text}`,
  ];
  if (block.level !== undefined) {
    parts.push(`level\x01${block.level}`);
  }
  return parts.join("\x02");
}

/**
 * Returns the deterministic 8-char hex content hash for a document block.
 *
 * The same block content always produces the same hash in both Node and the
 * browser — callers can rely on this for staleness detection without any
 * additional normalisation.
 */
export function hashDocumentBlock(block: DocumentBlock): string {
  return fnv1aHex(documentBlockSignature(block));
}
