"use server";

import { revalidatePath } from "next/cache";

import { requireDocumentActionContext } from "./document-context";
import {
  createCommentService,
  type CommentThread,
  type CreateCommentInput,
  type ListCommentsOptions,
} from "@/lib/comments";

const commentService = createCommentService({
  requireDocumentContext: requireDocumentActionContext,
});

export async function listComments(
  documentId: string,
  options: ListCommentsOptions = {},
): Promise<CommentThread[]> {
  return commentService.listComments(documentId, options);
}

export async function createComment(
  documentId: string,
  input: CreateCommentInput,
): Promise<CommentThread[]> {
  const result = await commentService.createComment(documentId, input);
  revalidatePath(`/app/documents/${result.documentId}`);
  return result.threads;
}

export async function editComment(
  commentId: string,
  newBody: string,
): Promise<CommentThread[]> {
  const result = await commentService.editComment(commentId, newBody);
  revalidatePath(`/app/documents/${result.documentId}`);
  return result.threads;
}

export async function deleteComment(
  commentId: string,
): Promise<CommentThread[]> {
  const result = await commentService.deleteComment(commentId);
  revalidatePath(`/app/documents/${result.documentId}`);
  return result.threads;
}

export async function setCommentResolved(
  commentId: string,
  resolved: boolean,
): Promise<CommentThread[]> {
  const result = await commentService.setCommentResolved(commentId, resolved);
  revalidatePath(`/app/documents/${result.documentId}`);
  return result.threads;
}
