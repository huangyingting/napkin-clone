import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { requireDocumentActionContext } from "@/lib/actions/document-action-context";
import { createCommentService } from "@/lib/comments";
import { prisma } from "@/lib/prisma";

import {
  buildDocumentEditorViewModel,
  type DocumentEditorViewModel,
} from "./view-model";

const documentEditorSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    contentJson: true,
    deckJson: true,
    isShared: true,
    shareId: true,
    slug: true,
    shareExpiresAt: true,
    shareEmbedEnabled: true,
    sharePresentEnabled: true,
    ownerId: true,
    workspaceId: true,
    tags: {
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    },
    workspace: {
      select: {
        name: true,
        ownerId: true,
        members: {
          where: { userId },
          select: { userId: true, role: true },
        },
      },
    },
  }) satisfies Prisma.DocumentSelect;

const userTagSelect = { id: true, name: true, slug: true } as const;

const commentService = createCommentService({
  requireDocumentContext: requireDocumentActionContext,
});

export async function loadDocumentEditorViewModel({
  documentId,
  userId,
  userName,
}: {
  documentId: string;
  userId: string;
  userName: string;
}): Promise<DocumentEditorViewModel | null> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
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
    select: documentEditorSelect(userId),
  });

  if (!document) {
    return null;
  }

  const [initialComments, allTags] = await Promise.all([
    commentService.listComments(document.id),
    prisma.tag.findMany({
      where: { ownerId: userId },
      orderBy: { name: "asc" },
      select: userTagSelect,
    }),
  ]);

  return buildDocumentEditorViewModel({
    document,
    userId,
    userName,
    initialComments,
    allTags,
  });
}
