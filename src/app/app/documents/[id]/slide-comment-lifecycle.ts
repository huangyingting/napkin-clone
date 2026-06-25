"use server";

import { requireDocumentActionContext } from "@/lib/actions/document-action-context";
import { createCommentService } from "@/lib/comments";
import type { Deck } from "@/lib/presentation/deck";

const commentService = createCommentService({
  requireDocumentContext: requireDocumentActionContext,
});

export async function floatCommentsOnSlideDelete(
  documentId: string,
  slideId: string,
): Promise<void> {
  return commentService.floatCommentsOnSlideDelete(documentId, slideId);
}

export async function floatCommentsOnElementDelete(
  documentId: string,
  slideId: string,
  elementId: string,
): Promise<void> {
  return commentService.floatCommentsOnElementDelete(
    documentId,
    slideId,
    elementId,
  );
}

export async function getOrphanedCommentIds(
  documentId: string,
  deck: Deck,
): Promise<string[]> {
  return commentService.getOrphanedCommentIds(documentId, deck);
}

export async function floatOrphanedCommentsAfterRestore(
  documentId: string,
  deck: Deck,
): Promise<{ floatedCount: number }> {
  return commentService.floatOrphanedCommentsAfterRestore(documentId, deck);
}
