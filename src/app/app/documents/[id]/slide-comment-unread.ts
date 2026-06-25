"use server";

/**
 * Unread/read state for document comments (text and slide-anchored).
 *
 * ## Model
 *
 * `CommentRead` holds a per-(user, document) `lastReadAt` timestamp. A comment
 * is "unread" for a user when:
 *   1. It was created after `lastReadAt` (or `lastReadAt` is null — never read).
 *   2. It is NOT authored by the user themselves (own comments are never unread).
 *   3. It is a top-level comment (parentId null) — replies are counted with
 *      their thread.
 *
 * Slide-anchored comments are just `Comment` rows on the document with a non-null
 * `slideId`. They participate in the same unread count automatically. No schema
 * change is needed.
 *
 * ## Filtering
 *
 * `getUnreadCommentCount` accepts an optional `scope` to count only text
 * comments, only slide comments, or all (default). This is useful when a UI
 * surfaces slide comments separately from document text comments.
 *
 * ## Pure helper
 *
 * `isCommentUnread` is exported as a pure function for unit tests.
 */

import { requireDocumentActionContext } from "@/lib/actions/document-action-context";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

/**
 * Returns true when a comment should be counted as unread for `userId`.
 *
 * Pure: no I/O; fully unit-testable.
 *
 * @param comment  Minimal comment record with createdAt and authorId.
 * @param userId   The viewing user's ID.
 * @param lastReadAt The timestamp of the user's last read, or null if never read.
 */
export function isCommentUnread(
  comment: { createdAt: Date; authorId: string },
  userId: string,
  lastReadAt: Date | null,
): boolean {
  // Own comments are never unread.
  if (comment.authorId === userId) {
    return false;
  }
  // If never read, everything is unread.
  if (lastReadAt === null) {
    return true;
  }
  // Unread if created after the last read timestamp.
  return comment.createdAt > lastReadAt;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export type UnreadCountScope = "all" | "text" | "slide";

/**
 * Returns the number of unread top-level comment threads for the current user
 * on the given document. Slide-anchored comments are included in the default
 * "all" scope.
 *
 * @param documentId  The document to count for.
 * @param scope       "all" (default) | "text" (text/visual only) | "slide"
 *                    (slide-anchored only).
 */
export async function getUnreadCommentCount(
  documentId: string,
  scope: UnreadCountScope = "all",
): Promise<number> {
  const { user } = await requireDocumentActionContext(documentId, "view");

  // Fetch the user's last-read timestamp for this document.
  const readRecord = await prisma.commentRead.findUnique({
    where: { userId_documentId: { userId: user.id, documentId } },
    select: { lastReadAt: true },
  });
  const lastReadAt = readRecord?.lastReadAt ?? null;

  // Build scope filter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeWhere: Record<string, any> = {};
  if (scope === "slide") {
    scopeWhere.slideId = { not: null };
  } else if (scope === "text") {
    scopeWhere.slideId = null;
  }

  // Fetch top-level comments (excluding the user's own).
  const comments = await prisma.comment.findMany({
    where: {
      documentId,
      parentId: null,
      authorId: { not: user.id },
      ...scopeWhere,
    },
    select: { createdAt: true, authorId: true },
  });

  return comments.filter((c) => isCommentUnread(c, user.id, lastReadAt)).length;
}

/**
 * Stamps `lastReadAt = now()` for the current user on the given document.
 * After this, all existing comments are considered read for that user.
 *
 * Creates the CommentRead row on first call; updates it on subsequent calls.
 */
export async function markDocumentCommentsRead(
  documentId: string,
): Promise<void> {
  const { user } = await requireDocumentActionContext(documentId, "view");

  await prisma.commentRead.upsert({
    where: { userId_documentId: { userId: user.id, documentId } },
    update: { lastReadAt: new Date() },
    create: { userId: user.id, documentId, lastReadAt: new Date() },
  });
}
