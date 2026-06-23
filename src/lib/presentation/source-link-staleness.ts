/**
 * Pure, DOM-free staleness detection for source-linked slide elements.
 *
 * When a user inserts a document text block onto a slide, the element's
 * `sourceRef` is stamped with the block's `blockId` and a `contentHash` of
 * the block content at insertion time (issue #377). This module provides a
 * single function — {@link findStaleSourceLinks} — that compares those
 * persisted refs against a freshly collected set of document blocks and
 * returns every ref whose source has either changed or disappeared.
 *
 * Design notes:
 *  - Only elements with a fully-wired `sourceRef` (both `blockId` and
 *    `contentHash`) are checked. Pre-#377 insertions (no `sourceRef`),
 *    explicitly unlinked refs (`sourceRef.unlinked === true`), and refs
 *    without a `contentHash` are silently skipped.
 *  - The `freshBlocks` map is built once per call from the `blockId` field
 *    on `DocumentTextBlock`s. Visual blocks carry a `visualId`, not a
 *    `blockId`, and are never considered for text-staleness.
 *  - Hash comparison uses the same {@link hashDocumentBlock} used at
 *    insertion time, so the algorithm is symmetric and zero-dep.
 */

import type { Deck } from "./deck";
import type {
  DocumentBlock,
  DocumentTextBlock,
} from "@/lib/visual/document-export";
import { hashDocumentBlock } from "./document-block-hash";

/** Reason a source link is considered stale. */
export type StaleReason =
  /** The source block still exists but its content hash no longer matches. */
  | "content_changed"
  /** The source block can no longer be found in the fresh document blocks. */
  | "block_missing";

/** A single stale source-link entry. */
export interface StaleSourceLink {
  /** ID of the slide that contains the stale element. */
  slideId: string;
  /** ID of the stale slide element. */
  elementId: string;
  /** The `blockId` from the element's `sourceRef`. */
  blockId: string;
  /** Why the link is considered stale. */
  reason: StaleReason;
}

/**
 * Returns every slide element whose `sourceRef` link is stale with respect to
 * the supplied `freshBlocks`.
 *
 * An element is stale when:
 *  - Its `sourceRef.blockId` does not appear in `freshBlocks` → `"block_missing"`
 *  - Its `sourceRef.contentHash` differs from `hashDocumentBlock(freshBlock)` → `"content_changed"`
 *
 * Elements without a `sourceRef`, with `sourceRef.unlinked === true`, or with
 * a `sourceRef` lacking a `contentHash` are ignored and never returned.
 *
 * @param deck        The persisted deck whose elements are examined.
 * @param freshBlocks Output of {@link collectDocumentBlocks} from the current
 *                    document state. Blocks without a `blockId` are skipped
 *                    (they cannot be matched by id).
 */
export function findStaleSourceLinks(
  deck: Deck,
  freshBlocks: readonly DocumentBlock[],
): StaleSourceLink[] {
  // Index fresh text blocks by blockId for O(1) lookup.
  const blockById = new Map<string, DocumentTextBlock>();
  for (const block of freshBlocks) {
    if (block.kind === "text" && block.blockId !== undefined) {
      blockById.set(block.blockId, block);
    }
  }

  const stale: StaleSourceLink[] = [];

  for (const slide of deck.slides) {
    if (!slide.elements) continue;
    for (const element of slide.elements) {
      const { sourceRef } = element;
      // Skip: no ref, explicitly unlinked, or no contentHash to compare.
      if (
        sourceRef === undefined ||
        sourceRef.unlinked === true ||
        sourceRef.contentHash === undefined
      ) {
        continue;
      }

      const fresh = blockById.get(sourceRef.blockId);
      if (fresh === undefined) {
        stale.push({
          slideId: slide.id,
          elementId: element.id,
          blockId: sourceRef.blockId,
          reason: "block_missing",
        });
        continue;
      }

      const freshHash = hashDocumentBlock(fresh);
      if (freshHash !== sourceRef.contentHash) {
        stale.push({
          slideId: slide.id,
          elementId: element.id,
          blockId: sourceRef.blockId,
          reason: "content_changed",
        });
      }
    }
  }

  return stale;
}
