"use server";

/**
 * Server actions for slide comment anchor lifecycle operations.
 *
 * When slides or elements are deleted from a deck the comments anchored to
 * them should not be silently lost. This module provides:
 *
 *  - **Float to deck** (`floatCommentsOnSlideDelete`): when a slide is deleted,
 *    all non-resolved comments anchored to that slide are promoted to deck-level
 *    comments (slideId, elementId, anchorGeometry all cleared). The comment
 *    body and thread history are preserved — the comment simply becomes a
 *    deck-level thread.
 *
 *  - **Float to slide** (`floatCommentsOnElementDelete`): when an element is
 *    deleted, comments anchored to that element are kept on the slide but
 *    the elementId is cleared. Geometry is preserved (it was expressed in
 *    slide-percent coordinates and remains valid).
 *
 *  - **Duplicate slide** (`getExcludedSlideCommentIds`): duplicating a slide
 *    EXCLUDES existing comments — the new slide starts with a clean comment
 *    slate. This is a policy choice: comments are reviews of specific content
 *    state, not structural metadata.
 *
 *  - **Version restore**: no explicit DB action is needed. When the deck is
 *    restored to a version where a slide no longer exists, the anchor's
 *    `resolveAnchorState` returns "orphaned" and the UI surfaces it accordingly.
 *    A helper `getOrphanedSlideCommentIds` is provided for UIs that want to
 *    offer a bulk-float action.
 *
 * ## Pure helpers
 *
 * `applySlideDeleteToAnchors` and `applyElementDeleteToAnchors` are exported
 * as pure functions so tests can verify the transformation policy without a DB.
 */

import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import {
  commentAnchorFromRecord,
  floatAnchorToDeck,
  floatAnchorToSlide,
  resolveAnchorState,
  type SlideCommentAnchor,
} from "@/lib/presentation/slide-comment-anchors";
import type { Deck } from "@/lib/presentation/deck";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Given a list of comment anchor records and a `deletedSlideId`, returns a new
 * list with every anchor that was attached to the deleted slide floated to
 * deck level. Other anchors are returned unchanged.
 *
 * Pure; does not touch the database.
 */
export function applySlideDeleteToAnchors(
  records: readonly SlideCommentAnchor[],
  deletedSlideId: string,
): SlideCommentAnchor[] {
  return records.map((anchor) =>
    anchor.slideId === deletedSlideId ? floatAnchorToDeck(anchor) : anchor,
  );
}

/**
 * Given a list of comment anchor records, a `slideId`, and a
 * `deletedElementId`, returns a new list with every anchor on that slide
 * element floated to slide level. Other anchors are returned unchanged.
 *
 * Pure; does not touch the database.
 */
export function applyElementDeleteToAnchors(
  records: readonly SlideCommentAnchor[],
  slideId: string,
  deletedElementId: string,
): SlideCommentAnchor[] {
  return records.map((anchor) =>
    anchor.slideId === slideId && anchor.elementId === deletedElementId
      ? floatAnchorToSlide(anchor)
      : anchor,
  );
}

/**
 * Returns the subset of the given anchor list whose slideId or elementId is
 * no longer present in `deck`. These are candidates for being surfaced as
 * "orphaned" after a version restore.
 *
 * Pure; does not touch the database.
 */
export function findOrphanedAnchors(
  records: readonly SlideCommentAnchor[],
  deck: Deck,
): SlideCommentAnchor[] {
  return records.filter(
    (anchor) => resolveAnchorState(anchor, deck) === "orphaned",
  );
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Floats all non-resolved comments anchored to `slideId` in `documentId` to
 * deck level. Called before (or immediately after) a slide is removed from the
 * deck so its comments are not silently orphaned.
 *
 * Requires the caller to have view access to the document (same permission
 * level as creating a comment, consistent with being able to interact with
 * comments on the slide).
 */
export async function floatCommentsOnSlideDelete(
  documentId: string,
  slideId: string,
): Promise<void> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "view");

  await prisma.comment.updateMany({
    where: {
      documentId,
      slideId,
      resolved: false,
    },
    data: {
      slideId: null,
      elementId: null,
      anchorGeometry: Prisma.DbNull,
    },
  });

  // Also float resolved comments so they aren't orphaned permanently.
  await prisma.comment.updateMany({
    where: {
      documentId,
      slideId,
    },
    data: {
      slideId: null,
      elementId: null,
      anchorGeometry: Prisma.DbNull,
    },
  });
}

/**
 * Floats all comments anchored to `elementId` on `slideId` up to slide level.
 * Called before (or immediately after) a slide element is removed.
 *
 * Geometry is preserved — it is expressed in slide-percent coordinates and
 * remains valid as a slide-level pin after the element is gone.
 */
export async function floatCommentsOnElementDelete(
  documentId: string,
  slideId: string,
  elementId: string,
): Promise<void> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "view");

  await prisma.comment.updateMany({
    where: {
      documentId,
      slideId,
      elementId,
    },
    data: {
      elementId: null,
    },
  });
}

/**
 * Returns the IDs of comments on `documentId` whose slide or element anchor
 * no longer exists in `deck`. Useful for offering a bulk "float all orphaned"
 * action after a version restore.
 *
 * Requires view access to the document.
 */
export async function getOrphanedCommentIds(
  documentId: string,
  deck: Deck,
): Promise<string[]> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "view");

  const slideAnchoredComments = await prisma.comment.findMany({
    where: { documentId, parentId: null, slideId: { not: null } },
    select: {
      id: true,
      slideId: true,
      elementId: true,
      anchorGeometry: true,
    },
  });

  const orphaned: string[] = [];
  for (const c of slideAnchoredComments) {
    const anchor = commentAnchorFromRecord(c);
    if (resolveAnchorState(anchor, deck) === "orphaned") {
      orphaned.push(c.id);
    }
  }
  return orphaned;
}

/**
 * Floats all comments that are orphaned against the provided `deck` to deck
 * level. Intended to be called after a version restore when the restored deck
 * may no longer contain slides/elements that comments reference.
 *
 * Requires view access to the document.
 */
export async function floatOrphanedCommentsAfterRestore(
  documentId: string,
  deck: Deck,
): Promise<{ floatedCount: number }> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "view");

  const slideAnchoredComments = await prisma.comment.findMany({
    where: { documentId, parentId: null, slideId: { not: null } },
    select: {
      id: true,
      slideId: true,
      elementId: true,
      anchorGeometry: true,
    },
  });

  const orphanedIds: string[] = [];
  for (const c of slideAnchoredComments) {
    const anchor = commentAnchorFromRecord(c);
    if (resolveAnchorState(anchor, deck) === "orphaned") {
      orphanedIds.push(c.id);
    }
  }

  if (orphanedIds.length > 0) {
    await prisma.comment.updateMany({
      where: { id: { in: orphanedIds } },
      data: { slideId: null, elementId: null, anchorGeometry: Prisma.DbNull },
    });
  }

  return { floatedCount: orphanedIds.length };
}
