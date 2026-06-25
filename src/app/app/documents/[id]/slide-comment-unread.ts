"use server";

import { requireDocumentActionContext } from "@/lib/actions/document-action-context";
import { createCommentService, type UnreadCountScope } from "@/lib/comments";

const commentService = createCommentService({
  requireDocumentContext: requireDocumentActionContext,
});

export async function getUnreadCommentCount(
  documentId: string,
  scope: UnreadCountScope = "all",
): Promise<number> {
  return commentService.getUnreadCommentCount(documentId, scope);
}

export async function markDocumentCommentsRead(
  documentId: string,
): Promise<void> {
  return commentService.markDocumentCommentsRead(documentId);
}
