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
 * Issue #424 extends this to visual blocks: inserted document visuals may
 * carry `sourceRef.blockKind === "visual"` with `blockId` equal to the
 * document visual's `visualId`. Staleness is detected the same way.
 *
 * Issue #408 adds pure action helpers — {@link updateTextElementFromBlock} and
 * {@link updateVisualElementFromBlock} — that preserve geometry/style/z-order
 * while refreshing content from the fresh source block.
 *
 * Design notes:
 *  - Only elements with a fully-wired `sourceRef` (both `blockId` and
 *    `contentHash`) are checked. Pre-#377 insertions (no `sourceRef`),
 *    explicitly unlinked refs (`sourceRef.unlinked === true`), and refs
 *    without a `contentHash` are silently skipped.
 *  - Text blocks are indexed by `blockId`; visual blocks are indexed by
 *    `visualId`. The `sourceRef.blockKind` field disambiguates which map to
 *    consult (`"text"` → text map; `"visual"` → visual map).
 *  - Elements whose source block is missing produce `"block_missing"` (orphan);
 *    elements whose hash differs produce `"content_changed"`. Both are subtypes
 *    of {@link StaleReason} so callers can display them distinctly (#410).
 */

import type { Deck } from "./deck-core";
import type { TextElement, VisualElement } from "./deck-elements";
import type { SourceRef } from "./deck-source-refs";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import { hashDocumentBlock } from "./document-block-hash";

function elementContent(
  element: TextElement | VisualElement,
): Record<string, any> {
  return ((element as any).content ?? {}) as Record<string, any>;
}

function elementSourceRef(element: {
  source?: SourceRef;
  sourceRef?: SourceRef;
}): SourceRef | undefined {
  return element.source ?? element.sourceRef;
}

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
  /**
   * Kind of the source block. Matches `sourceRef.blockKind`.
   */
  blockKind: "text" | "visual";
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
  const textBlockById = new Map<string, DocumentTextBlock>();
  // Index fresh visual blocks by visualId for O(1) lookup.
  const visualBlockByVisualId = new Map<string, DocumentBlock>();
  for (const block of freshBlocks) {
    if (block.kind === "text" && block.blockId !== undefined) {
      textBlockById.set(block.blockId, block);
    } else if (block.kind === "visual") {
      visualBlockByVisualId.set(block.visualId, block);
    }
  }

  const stale: StaleSourceLink[] = [];

  for (const slide of deck.slides) {
    if (!slide.elements) continue;
    for (const element of slide.elements) {
      const sourceRef = elementSourceRef(element);
      // Skip: no ref, explicitly unlinked, or no contentHash to compare.
      if (
        sourceRef === undefined ||
        sourceRef.unlinked === true ||
        sourceRef.contentHash === undefined
      ) {
        continue;
      }

      const blockKind = sourceRef.blockKind;

      if (blockKind === "visual") {
        // Visual block: look up by visualId (blockId holds the visualId).
        const fresh = visualBlockByVisualId.get(sourceRef.blockId);
        if (fresh === undefined) {
          stale.push({
            slideId: slide.id,
            elementId: element.id,
            blockId: sourceRef.blockId,
            reason: "block_missing",
            blockKind: "visual",
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
            blockKind: "visual",
          });
        }
      } else {
        // Text block (default): look up by blockId.
        const fresh = textBlockById.get(sourceRef.blockId);
        if (fresh === undefined) {
          stale.push({
            slideId: slide.id,
            elementId: element.id,
            blockId: sourceRef.blockId,
            reason: "block_missing",
            blockKind: "text",
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
            blockKind: "text",
          });
        }
      }
    }
  }

  return stale;
}

// ---------------------------------------------------------------------------
// Action helpers (issue #408)
// ---------------------------------------------------------------------------

/**
 * Returns a copy of a text element with content refreshed from a fresh source
 * block, while preserving all geometry (box, zIndex, rotation, opacity),
 * style, id, and role.
 *
 * The `sourceRef.contentHash` and `sourceRef.linkedAt` are updated to reflect
 * the new content; `sourceRef.unlinked` is cleared (the link is now fresh).
 * Runs are carried through only when present on the fresh block.
 *
 * Safe to call even when the element has no `sourceRef` — in that case a new
 * minimal ref is built from the provided `newRef` argument.
 *
 * @param element    The stale text element to update.
 * @param freshBlock The fresh block from the current document.
 * @param newRef     A valid active SourceRef reflecting the fresh state. The
 *                   caller is responsible for computing `contentHash` via
 *                   `hashDocumentBlock(freshBlock)` and setting `linkedAt`.
 */
export function updateTextElementFromBlock(
  element: TextElement,
  freshBlock: DocumentTextBlock,
  newRef: SourceRef,
): TextElement {
  const runs =
    freshBlock.runs && freshBlock.runs.length > 0 ? freshBlock.runs : undefined;
  return {
    ...element,
    content: {
      ...elementContent(element),
      kind: "text",
      text: freshBlock.text,
      ...(runs !== undefined ? { runs } : { runs: undefined }),
      paragraphs: [
        {
          text: freshBlock.text,
          ...(runs !== undefined ? { runs } : {}),
        },
      ],
    },
    source: { ...newRef, unlinked: undefined },
  } as unknown as TextElement;
}

/**
 * Returns a copy of a visual element with the source ref refreshed to point
 * at a new visual id (i.e. after a relink to a different document visual).
 *
 * The `visualId` on the element is updated to match the new `blockId` in
 * `newRef`. Geometry and styling are preserved verbatim.
 *
 * @param element The existing visual element.
 * @param newRef  A valid active SourceRef for the new visual block. `blockId`
 *                must equal the new `visualId`; `blockKind` must be `"visual"`.
 */
export function updateVisualElementFromBlock(
  element: VisualElement,
  newRef: SourceRef,
): VisualElement {
  return {
    ...element,
    content: {
      ...elementContent(element),
      kind: "visual",
      visualId: newRef.blockId,
    },
    source: { ...newRef, unlinked: undefined },
  } as unknown as VisualElement;
}

/**
 * Builds a fresh {@link SourceRef} for a relink/update operation.
 *
 * @param existing   The current sourceRef (to carry over documentId).
 * @param blockId    The block id (or visualId) of the new source block.
 * @param contentHash  Hash of the new block content.
 * @param linkedAt   ISO timestamp for the relink.
 * @param blockKind  Kind of the new block.
 */
export function buildRefreshSourceRef(
  existing: SourceRef,
  blockId: string,
  contentHash: string,
  linkedAt: string,
  blockKind: "text" | "visual",
): SourceRef {
  return {
    documentId: existing.documentId,
    blockId,
    contentHash,
    linkedAt,
    blockKind,
  };
}
