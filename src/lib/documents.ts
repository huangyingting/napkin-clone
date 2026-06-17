import { prisma } from "@/lib/prisma";

/** Minimal document identity returned by the access check. */
export type AccessibleDocument = {
  id: string;
  ownerId: string;
  workspaceId: string | null;
};

/**
 * Returns the document if `userId` may access it, otherwise `null`.
 *
 * Access is granted when the user owns the document OR is a member (any role)
 * of the document's workspace. This is the shared authorization gate for any
 * per-document feature that workspace members collaborate on (e.g. comments),
 * mirroring the inline check the editor page performs.
 */
export async function getAccessibleDocument(
  userId: string,
  documentId: string,
): Promise<AccessibleDocument | null> {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { ownerId: userId },
        {
          workspaceId: { not: null },
          workspace: {
            OR: [{ ownerId: userId }, { members: { some: { userId } } }],
          },
        },
      ],
    },
    select: { id: true, ownerId: true, workspaceId: true },
  });
}
