import "server-only";

import { buildAccountExport, type AccountExport } from "@/lib/account/export";
import { prisma } from "@/lib/prisma";

export async function loadAccountExport(
  userId: string,
  now = new Date(),
): Promise<AccountExport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      plan: true,
      createdAt: true,
    },
  });
  if (!user) {
    return null;
  }

  const [
    documents,
    workspacesOwned,
    workspaceMemberships,
    comments,
    tags,
    brands,
    assets,
    subscription,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        content: true,
        contentJson: true,
        deckJson: true,
        workspaceId: true,
        isShared: true,
        createdAt: true,
        updatedAt: true,
        visuals: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            type: true,
            title: true,
            anchorBlockId: true,
            orderIndex: true,
            data: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        versions: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.workspace.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, workspaceId: true, role: true, createdAt: true },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        documentId: true,
        body: true,
        resolved: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.tag.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.brand.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        logoAssetId: true,
        fontAssetId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.asset.findMany({
      where: {
        OR: [
          { document: { ownerId: userId } },
          { workspace: { ownerId: userId } },
          { brand: { ownerId: userId } },
        ],
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        mimeType: true,
        byteSize: true,
        checksum: true,
        createdAt: true,
      },
    }),
    prisma.subscription.findUnique({
      where: { userId },
      select: {
        id: true,
        plan: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return buildAccountExport({
    user,
    documents,
    workspacesOwned,
    workspaceMemberships,
    comments,
    tags,
    brands,
    assets,
    subscription: subscription ?? null,
    now,
  });
}
