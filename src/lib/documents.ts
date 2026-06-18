import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Minimal document identity returned by the access check. */
export type AccessibleDocument = {
  id: string;
  ownerId: string;
  workspaceId: string | null;
};

/**
 * The `where.OR` granting a user access to a document: they own it OR are a
 * member (any role) of its workspace. Exposed so actions that must operate on
 * soft-deleted rows (e.g. restore) can reuse the exact same authorization scope
 * with a different `deletedAt` filter.
 */
export function documentAccessOr(
  userId: string,
): NonNullable<Prisma.DocumentWhereInput["OR"]> {
  return [
    { ownerId: userId },
    {
      workspaceId: { not: null },
      workspace: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
  ];
}

/**
 * Returns the document if `userId` may access it, otherwise `null`.
 *
 * Access is granted when the user owns the document OR is a member (any role)
 * of the document's workspace. This is the shared authorization gate for any
 * per-document feature that workspace members collaborate on (e.g. comments),
 * mirroring the inline check the editor page performs. Soft-deleted documents
 * (`deletedAt` set) are never accessible.
 */
export async function getAccessibleDocument(
  userId: string,
  documentId: string,
): Promise<AccessibleDocument | null> {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      OR: documentAccessOr(userId),
    },
    select: { id: true, ownerId: true, workspaceId: true },
  });
}
