import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPresentViewer } from "@/components/presentation/public-present-viewer";
import { excerpt } from "@/lib/document-stats";
import { prisma } from "@/lib/prisma";
import { buildShareSegment, shareIdFromParam } from "@/lib/slug";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import { collectDocumentBlocks } from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";
const SITE_NAME = "Napkin Clone";

function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
}

/**
 * SEO + social unfurl metadata for the public presentation page.
 * Mirrors the `/share/[shareId]` `generateMetadata` pattern.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const resolvedShareId = shareIdFromParam(shareId);

  const document = await prisma.document.findFirst({
    where: { shareId: resolvedShareId, isShared: true, deletedAt: null },
    select: { title: true, content: true, shareId: true, slug: true },
  });

  if (!document || !document.shareId) {
    return {
      title: `Presentation — ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const base = siteBaseUrl();
  const segment = buildShareSegment(document.slug, document.shareId);
  const canonical = `${base}/present/${segment}`;
  const shareCanonical = `${base}/share/${segment}`;
  const description = excerpt(document.content);
  const ogImage = `${base}/share/${segment}/opengraph-image`;
  const pageTitle = `${document.title} — Presentation — ${SITE_NAME}`;

  return {
    title: pageTitle,
    description,
    alternates: { canonical },
    openGraph: {
      title: pageTitle,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630, alt: document.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImage],
    },
    // Point bots at the share page as the canonical document URL.
    other: { "og:see_also": shareCanonical },
  };
}

export default async function PresentPage({
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

  // Collect blocks from contentJson so we can build both the visual map and
  // a fallback deck when no persisted deckJson is available.
  const blocks = collectDocumentBlocks(document.contentJson ?? "");

  // Build visual lookup map: visualId → Visual
  const visualsRecord: Record<string, Visual> = {};
  for (const block of blocks) {
    if (block.kind === "visual") {
      visualsRecord[block.visualId] = block.visual;
    }
  }

  // Prefer the persisted (edited) deck; fall back to the auto-generated one.
  let deckJson: unknown = undefined;
  if (document.deckJson) {
    try {
      deckJson =
        typeof document.deckJson === "string"
          ? JSON.parse(document.deckJson)
          : document.deckJson;
    } catch {
      // malformed JSON — fall through to buildDeckFromBlocks
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
    />
  );
}
