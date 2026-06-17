"use server";

import { revalidatePath } from "next/cache";

import { getAccessibleDocument } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export type CommentAnchorType = "text" | "visual";

export type CommentAuthor = {
  id: string;
  name: string;
};

export type CommentNode = {
  id: string;
  body: string;
  author: CommentAuthor;
  createdAt: string;
};

export type CommentThread = CommentNode & {
  resolved: boolean;
  anchorType: CommentAnchorType | null;
  anchorText: string | null;
  anchorNodeId: string | null;
  replies: CommentNode[];
};

export type CreateCommentInput = {
  body: string;
  parentId?: string | null;
  anchorType?: CommentAnchorType | null;
  anchorText?: string | null;
  anchorNodeId?: string | null;
};

const MAX_BODY_LENGTH = 5_000;
const MAX_ANCHOR_TEXT_LENGTH = 280;
const MAX_ANCHOR_NODE_ID_LENGTH = 200;

type AuthorRecord = { id: string; name: string | null; email: string };

function displayName(author: AuthorRecord): string {
  return author.name ?? author.email ?? "Unknown";
}

function normalizeAnchorType(value: string | null): CommentAnchorType | null {
  return value === "text" || value === "visual" ? value : null;
}

/**
 * Loads the comment threads for a document the current user can access, newest
 * last. Top-level comments carry their anchor + resolved state and their
 * one-level-deep replies. Throws when the user lacks access to the document.
 */
export async function listComments(
  documentId: string,
): Promise<CommentThread[]> {
  const user = await requireUser();

  const document = await getAccessibleDocument(user.id, documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  const roots = await prisma.comment.findMany({
    where: { documentId, parentId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      resolved: true,
      anchorType: true,
      anchorText: true,
      anchorNodeId: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return roots.map((root) => ({
    id: root.id,
    body: root.body,
    resolved: root.resolved,
    anchorType: normalizeAnchorType(root.anchorType),
    anchorText: root.anchorText,
    anchorNodeId: root.anchorNodeId,
    createdAt: root.createdAt.toISOString(),
    author: { id: root.author.id, name: displayName(root.author) },
    replies: root.replies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      author: { id: reply.author.id, name: displayName(reply.author) },
    })),
  }));
}

/**
 * Creates a comment (or a reply when `parentId` is set) on a document the
 * current user can access. Anchors apply to top-level comments only — replies
 * inherit their thread's anchor. Returns the refreshed thread list so the UI
 * always renders server truth (and therefore every collaborator's comments).
 */
export async function createComment(
  documentId: string,
  input: CreateCommentInput,
): Promise<CommentThread[]> {
  const user = await requireUser();

  const document = await getAccessibleDocument(user.id, documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  const body = input.body.trim().slice(0, MAX_BODY_LENGTH);
  if (body.length === 0) {
    throw new Error("Comment cannot be empty.");
  }

  // Replies: validate the parent belongs to this document and is a root.
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentId, documentId, parentId: null },
      select: { id: true },
    });
    if (!parent) {
      throw new Error("Parent comment not found.");
    }

    await prisma.comment.create({
      data: {
        documentId,
        authorId: user.id,
        body,
        parentId: parent.id,
      },
    });
  } else {
    const anchorType = normalizeAnchorType(input.anchorType ?? null);
    const anchorText = anchorType
      ? (input.anchorText?.trim().slice(0, MAX_ANCHOR_TEXT_LENGTH) ?? null)
      : null;
    const anchorNodeId =
      anchorType === "visual"
        ? (input.anchorNodeId?.slice(0, MAX_ANCHOR_NODE_ID_LENGTH) ?? null)
        : null;

    await prisma.comment.create({
      data: {
        documentId,
        authorId: user.id,
        body,
        anchorType,
        anchorText,
        anchorNodeId,
      },
    });
  }

  revalidatePath(`/app/documents/${documentId}`);
  return listComments(documentId);
}

/**
 * Marks a top-level comment resolved/unresolved. Access is checked against the
 * comment's document so only members can resolve. Returns the refreshed list.
 */
export async function setCommentResolved(
  commentId: string,
  resolved: boolean,
): Promise<CommentThread[]> {
  const user = await requireUser();

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, documentId: true },
  });
  if (!comment) {
    throw new Error("Comment not found.");
  }

  const document = await getAccessibleDocument(user.id, comment.documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { resolved },
  });

  revalidatePath(`/app/documents/${comment.documentId}`);
  return listComments(comment.documentId);
}
