import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPresentViewer } from "@/components/presentation/public-present-viewer";
import { prisma } from "@/lib/prisma";
import { shareIdFromParam } from "@/lib/slug";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import { collectDocumentBlocks } from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";

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
    where: { shareId: resolvedShareId, isShared: true, deletedAt: null },
    select: {
      title: true,
      contentJson: true,
      deckJson: true,
    },
  });

  if (!document) {
    notFound();
  }

  const blocks = collectDocumentBlocks(document.contentJson ?? "");

  const visualsRecord: Record<string, Visual> = {};
  for (const block of blocks) {
    if (block.kind === "visual") {
      visualsRecord[block.visualId] = block.visual;
    }
  }

  let deckJson: unknown = undefined;
  if (document.deckJson) {
    try {
      deckJson =
        typeof document.deckJson === "string"
          ? JSON.parse(document.deckJson)
          : document.deckJson;
    } catch {
      // malformed JSON — fall through
    }
  }

  const parsed = deckJson ? safeParseDeck(deckJson) : null;
  const deck =
    parsed && parsed.success ? parsed.data : buildDeckFromBlocks(blocks);

  return (
    <PublicPresentViewer
      deck={deck}
      visuals={visualsRecord}
      title={document.title}
      embed
    />
  );
}
