import type { Prisma } from "@/generated/prisma/client";

export function workspaceAccessOr(
  userId: string,
): NonNullable<Prisma.WorkspaceWhereInput["OR"]> {
  return [{ ownerId: userId }, { members: { some: { userId } } }];
}

export function accessibleWorkspaceWhere(
  userId: string,
  workspaceId?: string,
): Prisma.WorkspaceWhereInput {
  return {
    ...(workspaceId ? { id: workspaceId } : {}),
    OR: workspaceAccessOr(userId),
  };
}

export function documentAccessOr(
  userId: string,
): NonNullable<Prisma.DocumentWhereInput["OR"]> {
  return [
    { ownerId: userId },
    {
      workspaceId: { not: null },
      workspace: {
        OR: workspaceAccessOr(userId),
      },
    },
  ];
}

export function accessibleDocumentWhere(
  userId: string,
  documentId?: string,
  options: { includeDeleted?: boolean } = {},
): Prisma.DocumentWhereInput {
  return {
    ...(documentId ? { id: documentId } : {}),
    ...(options.includeDeleted ? {} : { deletedAt: null }),
    OR: documentAccessOr(userId),
  };
}
