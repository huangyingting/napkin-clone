import "server-only";

import { prisma } from "@/lib/prisma";

import {
  resolvePublicRenderWithSource,
  type PublicRenderDocumentRow,
  type ResolvePublicRenderInput,
} from "./resolver-core";
import {
  PUBLIC_RENDER_ASSET_ACCESS_SELECT,
  selectForPublicRenderProjection,
} from "./resolver-selects";

export async function resolvePublicRender(input: ResolvePublicRenderInput) {
  return resolvePublicRenderWithSource(
    {
      async findByShareId(shareId) {
        return (await prisma.document.findFirst({
          where: { shareId },
          select: selectForPublicRenderProjection(input.projection),
        })) as PublicRenderDocumentRow | null;
      },
      async findByDocumentId(documentId) {
        return (await prisma.document.findUnique({
          where: { id: documentId },
          select: PUBLIC_RENDER_ASSET_ACCESS_SELECT,
        })) as PublicRenderDocumentRow | null;
      },
    },
    input,
  );
}
