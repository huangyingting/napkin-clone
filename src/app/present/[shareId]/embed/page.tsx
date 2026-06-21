import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPresentViewer } from "@/components/presentation/public-present-viewer";
import { prisma } from "@/lib/prisma";
import { shareIdFromParam } from "@/lib/slug";
import {
  evaluateShareAccess,
  SHARE_ACCESS_SELECT,
  toShareAccessInput,
} from "@/lib/share-access";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import { buildPresentationBlocks } from "@/lib/presentation/present-blocks";
import { normalizeDeckRaw } from "@/lib/presentation/fresh-deck";
import type { Visual } from "@/lib/visual/schema";
import { shouldShowAttribution } from "@/lib/billing/attribution";

export const metadata: Metadata = {
  title: "Presentation — TextIQ",
};

/**
 * Chrome-free embeddable presentation viewer.
 *
 * Mirrors the `/embed/[shareId]` pattern for documents — shares the same
 * access gating (isShared + non-deleted) but renders the deck one slide at a
 * time in a frameless, HUD-minimal layout suitable for `<iframe>` embedding.
 *
 * The global site header is suppressed for all `/present/*` paths by
 * {@link HeaderGate}.
 */
export default async function PresentEmbedPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const resolvedShareId = shareIdFromParam(shareId);

  const document = await prisma.document.findFirst({
    where: { shareId: resolvedShareId },
    select: {
      title: true,
      content: true,
      contentJson: true,
      deckJson: true,
      ...SHARE_ACCESS_SELECT,
      owner: {
        select: { plan: true },
      },
    },
  });

  if (
    !document ||
    !evaluateShareAccess(
      toShareAccessInput(document, resolvedShareId, "present"),
    ).allow
  ) {
    notFound();
  }

  const blocks = buildPresentationBlocks(
    document.contentJson,
    document.content,
  );

  const visualsRecord: Record<string, Visual> = {};
  for (const block of blocks) {
    if (block.kind === "visual") {
      visualsRecord[block.visualId] = block.visual;
    }
  }

  const normalized = normalizeDeckRaw(document.deckJson);
  const parsed = normalized ? safeParseDeck(normalized) : null;
  const deck =
    parsed && parsed.success ? parsed.data : buildDeckFromBlocks(blocks);
  const showAttribution = shouldShowAttribution(document.owner.plan);

  return (
    <PublicPresentViewer
      deck={deck}
      visuals={visualsRecord}
      title={document.title}
      embed
      showAttribution={showAttribution}
    />
  );
}
