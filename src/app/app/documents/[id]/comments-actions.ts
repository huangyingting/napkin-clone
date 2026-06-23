"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  commentAnchorFromRecord,
  commentAnchorToRecord,
} from "@/lib/presentation/slide-comment-anchors";

import { canDeleteComment, canEditComment } from "./comment-permissions";
import {
  validateAnchorGeometry,
  validateElementId,
  validateSlideId,
} from "./comment-anchor-validation";

export type CommentAnchorType = "text" | "visual";

/** Normalized slide-level anchor returned by list/create actions. */
export type CommentSlideAnchor = {
  slideId: string | null;
  elementId: string | null;
  anchorGeometry: { x: number; y: number } | null;
};

type CommentAuthor = {
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
  /** Slide-level anchor (null for deck/text comments). */
  slideAnchor: CommentSlideAnchor | null;
  replies: CommentNode[];
};

export type CreateCommentInput = {
  body: string;
  parentId?: string | null;
  anchorType?: CommentAnchorType | null;
  anchorText?: string | null;
  anchorNodeId?: string | null;
  /** Slide ID to anchor this comment to a specific slide. */
  slideId?: string | null;
  /** Element ID within the slide (requires slideId). */
  elementId?: string | null;
  /** Optional pin-point in percent coordinates (0–100). */
  anchorGeometry?: { x: unknown; y: unknown } | null;
};

/**
 * Optional filters for listComments.
 * - `slideId`: when provided, only return comments anchored to that slide.
 * - `anchorScope`: "text" = text/visual anchors only; "slide" = slide-anchored
 *   only; "all" (default) = both.
 */
export type ListCommentsOptions = {
  slideId?: string | null;
  anchorScope?: "all" | "text" | "slide";
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

/** Builds a `CommentSlideAnchor` from DB record fields, or null when no slideId set. */
function buildSlideAnchor(record: {
  slideId?: string | null;
  elementId?: string | null;
  anchorGeometry?: unknown;
}): CommentSlideAnchor | null {
  const anchor = commentAnchorFromRecord(record);
  if (!anchor.slideId) {
    return null;
  }
  return {
    slideId: anchor.slideId,
    elementId: anchor.elementId ?? null,
    anchorGeometry: anchor.geometry ?? null,
  };
}

/**
 * Loads the comment threads for a document the current user can access, newest
 * last. Top-level comments carry their anchor + resolved state and their
 * one-level-deep replies. Throws when the user lacks access to the document.
 *
 * Pass `options.slideId` to restrict results to a specific slide.
 * Pass `options.anchorScope` to filter by anchor type ("text", "slide", or "all").
 */
export async function listComments(
  documentId: string,
  options: ListCommentsOptions = {},
): Promise<CommentThread[]> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, documentId, "view");

  const { anchorScope = "all" } = options;

  // Build scope filter for where clause.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeWhere: Record<string, any> = {};
  if (anchorScope === "slide") {
    scopeWhere.slideId = { not: null };
  } else if (anchorScope === "text") {
    scopeWhere.slideId = null;
  }

  // Optional slide filter (only meaningful when not filtering text-only).
  if (options.slideId !== undefined && anchorScope !== "text") {
    scopeWhere.slideId = options.slideId;
  }

  const roots = await prisma.comment.findMany({
    where: { documentId, parentId: null, ...scopeWhere },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      resolved: true,
      anchorType: true,
      anchorText: true,
      anchorNodeId: true,
      slideId: true,
      elementId: true,
      anchorGeometry: true,
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
    slideAnchor: buildSlideAnchor(root),
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
 *
 * Slide anchor rules:
 * - `slideId` sets the slide attachment; `elementId` requires `slideId`.
 * - `anchorGeometry` must have x/y in 0–100 percent range; rejected otherwise.
 * - Slide anchors are mutually exclusive with `anchorType` text/visual anchors.
 */
export async function createComment(
  documentId: string,
  input: CreateCommentInput,
): Promise<CommentThread[]> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, documentId, "view");

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
    const slideId = validateSlideId(input.slideId);
    const elementId = slideId ? validateElementId(input.elementId) : null;
    const geometry = validateAnchorGeometry(input.anchorGeometry ?? null);

    if (slideId) {
      // Slide-anchored comment — ignore text/visual anchor fields.
      const anchorRecord = commentAnchorToRecord({
        slideId,
        elementId,
        geometry,
      });
      await prisma.comment.create({
        data: {
          documentId,
          authorId: user.id,
          body,
          slideId: anchorRecord.slideId,
          elementId: anchorRecord.elementId,
          anchorGeometry:
            anchorRecord.anchorGeometry != null
              ? (anchorRecord.anchorGeometry as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
        },
      });
    } else {
      // Text/visual anchor (backward compatible path).
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
  }

  revalidatePath(`/app/documents/${documentId}`);
  return listComments(documentId);
}

/**
 * Edits the body of a comment. Only the comment's author may edit; document
 * view access is also required. Returns the refreshed thread list.
 */
export async function editComment(
  commentId: string,
  newBody: string,
): Promise<CommentThread[]> {
  const user = await requireUser();

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, documentId: true, authorId: true },
  });
  if (!comment) {
    throw new Error("Comment not found.");
  }

  await requireDocumentCapability(user.id, comment.documentId, "view");

  if (!canEditComment(user.id, comment)) {
    throw new Error("You can only edit your own comments.");
  }

  const body = newBody.trim().slice(0, MAX_BODY_LENGTH);
  if (body.length === 0) {
    throw new Error("Comment cannot be empty.");
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { body },
  });

  revalidatePath(`/app/documents/${comment.documentId}`);
  return listComments(comment.documentId);
}

/**
 * Deletes a comment (and its replies via cascade). Only the comment's author
 * may delete; document view access is also required. Returns the refreshed
 * thread list.
 */
export async function deleteComment(
  commentId: string,
): Promise<CommentThread[]> {
  const user = await requireUser();

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, documentId: true, authorId: true },
  });
  if (!comment) {
    throw new Error("Comment not found.");
  }

  await requireDocumentCapability(user.id, comment.documentId, "view");

  if (!canDeleteComment(user.id, comment)) {
    throw new Error("You can only delete your own comments.");
  }

  await prisma.comment.delete({ where: { id: commentId } });

  revalidatePath(`/app/documents/${comment.documentId}`);
  return listComments(comment.documentId);
}

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

  await requireDocumentCapability(user.id, comment.documentId, "view");

  await prisma.comment.update({
    where: { id: commentId },
    data: { resolved },
  });

  revalidatePath(`/app/documents/${comment.documentId}`);
  return listComments(comment.documentId);
}
