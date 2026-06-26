import type { Prisma } from "@/generated/prisma/client";
import { SHARE_ACCESS_SELECT } from "@/lib/share-access";

import type { ResolvePublicRenderInput } from "./resolver-core";

const PUBLIC_RENDER_ACCESS_SELECT = {
  ...SHARE_ACCESS_SELECT,
} satisfies Prisma.DocumentSelect;

export const PUBLIC_RENDER_METADATA_SELECT = {
  title: true,
  contentJson: true,
  slug: true,
  ...PUBLIC_RENDER_ACCESS_SELECT,
} satisfies Prisma.DocumentSelect;

export const PUBLIC_RENDER_DOCUMENT_SELECT = {
  id: true,
  title: true,
  contentJson: true,
  ...PUBLIC_RENDER_ACCESS_SELECT,
  owner: {
    select: {
      name: true,
      plan: true,
    },
  },
} satisfies Prisma.DocumentSelect;

export const PUBLIC_RENDER_PRESENTATION_SELECT = {
  title: true,
  contentJson: true,
  deckJson: true,
  ...PUBLIC_RENDER_ACCESS_SELECT,
  owner: {
    select: {
      name: true,
      plan: true,
    },
  },
} satisfies Prisma.DocumentSelect;

export const PUBLIC_RENDER_ASSET_ACCESS_SELECT = {
  ownerId: true,
  workspaceId: true,
  ...PUBLIC_RENDER_ACCESS_SELECT,
  workspace: {
    select: {
      ownerId: true,
      members: { select: { userId: true, role: true } },
    },
  },
} satisfies Prisma.DocumentSelect;

export function selectForPublicRenderProjection(
  projection: ResolvePublicRenderInput["projection"],
): Prisma.DocumentSelect {
  switch (projection) {
    case "metadata":
      return PUBLIC_RENDER_METADATA_SELECT;
    case "document":
      return PUBLIC_RENDER_DOCUMENT_SELECT;
    case "presentation":
      return PUBLIC_RENDER_PRESENTATION_SELECT;
    case "assetAccess":
      return PUBLIC_RENDER_ASSET_ACCESS_SELECT;
  }
}
