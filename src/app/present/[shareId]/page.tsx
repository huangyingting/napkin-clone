import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPresentViewer } from "@/components/presentation/public-present-viewer";
import { excerpt } from "@/lib/document-stats";
import { prisma } from "@/lib/prisma";
import { buildShareSegment, shareIdFromParam } from "@/lib/slug";
import {
  evaluateShareAccess,
  SHARE_ACCESS_SELECT,
  toShareAccessInput,
} from "@/lib/share-access";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import { buildPresentationBlocks } from "@/lib/presentation/present-blocks";
import { normalizeDeckRaw } from "@/lib/presentation/fresh-deck";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import type { Visual } from "@/lib/visual/schema";
import { shouldShowAttribution } from "@/lib/billing/attribution";
import { app as appEnv } from "@/lib/env";
const SITE_NAME = "TextIQ";

function siteBaseUrl(): string {
  return appEnv.url();
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
    where: { shareId: resolvedShareId },
    select: {
      title: true,
      content: true,
      slug: true,
      ...SHARE_ACCESS_SELECT,
    },
  });

  if (
    !document ||
    !evaluateShareAccess(
      toShareAccessInput(document, resolvedShareId, "present"),
    ).allow
  ) {
    return {
      title: `Presentation — ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const base = siteBaseUrl();
  const segment = buildShareSegment(document.slug, resolvedShareId);
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

  const blocks = buildPresentationBlocks(document.contentJson);

  // Build visual lookup map: visualId → Visual
  const visualsRecord: Record<string, Visual> = {};
  for (const block of blocks) {
    if (block.kind === "visual") {
      visualsRecord[block.visualId] = block.visual;
    }
  }

  // Prefer the persisted (edited) deck; fall back to the auto-generated one.
  // Strip orphaned visual references so the audience never sees a silently
  // blank slide for a visual that no longer exists in the current content.
  const normalized = normalizeDeckRaw(document.deckJson);
  const parsed = normalized ? safeParseDeck(normalized) : null;
  const deck = stripOrphanedVisuals(
    parsed && parsed.success ? parsed.data : buildDeckFromBlocks(blocks),
    new Set(Object.keys(visualsRecord)),
  );
  const showAttribution = shouldShowAttribution(document.owner.plan);

  return (
    <PublicPresentViewer
      deck={deck}
      visuals={visualsRecord}
      title={document.title}
      showAttribution={showAttribution}
    />
  );
}
