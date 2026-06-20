import type { Prisma } from "@/generated/prisma/client";

/**
 * The `where.OR` granting a user *view* access to a document: they own it OR are
 * a member (any role) of its workspace. Used by read-only listing/search scopes.
 *
 * Role-aware mutation authorization (view/edit/manage) is centralized in
 * `@/lib/auth/document-permissions` — use `requireDocumentCapability` there for
 * any document mutation rather than scoping writes with this OR.
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
