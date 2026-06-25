import "server-only";

import { prisma } from "@/lib/prisma";
import { SHARE_ACCESS_SELECT } from "@/lib/share-access";

import {
  resolvePublicRenderWithSource,
  type PublicRenderDocumentRow,
  type ResolvePublicRenderInput,
} from "./resolver-core";

export const PUBLIC_RENDER_DOCUMENT_SELECT = {
  id: true,
  title: true,
  content: true,
  contentJson: true,
  deckJson: true,
  slug: true,
  ownerId: true,
  workspaceId: true,
  ...SHARE_ACCESS_SELECT,
  owner: {
    select: {
      name: true,
      email: true,
      plan: true,
    },
  },
  workspace: {
    select: {
      ownerId: true,
      members: { select: { userId: true, role: true } },
    },
  },
} as const;

export async function resolvePublicRender(input: ResolvePublicRenderInput) {
  return resolvePublicRenderWithSource(
    {
      async findByShareId(shareId) {
        return (await prisma.document.findFirst({
          where: { shareId },
          select: PUBLIC_RENDER_DOCUMENT_SELECT,
        })) as PublicRenderDocumentRow | null;
      },
      async findByDocumentId(documentId) {
        return (await prisma.document.findUnique({
          where: { id: documentId },
          select: PUBLIC_RENDER_DOCUMENT_SELECT,
        })) as PublicRenderDocumentRow | null;
      },
    },
    input,
  );
}
