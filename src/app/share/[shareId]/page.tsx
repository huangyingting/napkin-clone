import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LexicalReadOnly } from "@/components/lexical/lexical-read-only";

import { ShareLightbox } from "./share-lightbox";
import { MadeWithBadge } from "@/components/made-with-badge";
import { excerpt } from "@/lib/document-stats";
import { shouldShowAttribution } from "@/lib/billing/attribution";
import { prisma } from "@/lib/prisma";
import { buildShareSegment, shareIdFromParam } from "@/lib/slug";
import {
  evaluateShareAccess,
  SHARE_ACCESS_SELECT,
  toShareAccessInput,
} from "@/lib/share-access";
import { app as appEnv } from "@/lib/env";

const SITE_NAME = "TextIQ";

/** Absolute base URL for canonical/OG links. */
function siteBaseUrl(): string {
  return appEnv.url();
}

/**
 * SEO + social unfurl metadata for the share page. A shared document yields a
 * title, excerpt description, canonical URL, and Open Graph / Twitter Card tags
 * (with an auto-generated OG image, US-030). A non-shared/unknown document
 * yields safe, no-index defaults so private documents never leak.
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

  // Unknown, non-shared, expired, regenerated, or deleted link: safe defaults,
  // no indexing, no leak (issue #101 AC #4).
  if (
    !document ||
    !evaluateShareAccess(toShareAccessInput(document, resolvedShareId, "view"))
      .allow
  ) {
    return {
      title: `Shared Document — ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const base = siteBaseUrl();
  const segment = buildShareSegment(document.slug, resolvedShareId);
  const canonical = `${base}/share/${segment}`;
  const description = excerpt(document.content);
  const ogImage = `${base}/share/${segment}/opengraph-image`;
  const pageTitle = `${document.title} — ${SITE_NAME}`;

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
  };
}

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  const resolvedShareId = shareIdFromParam(shareId);

  // Find the document by shareId and apply the share-access policy (shared,
  // not expired/regenerated/deleted) via the centralized pure decision.
  const document = await prisma.document.findFirst({
    where: { shareId: resolvedShareId },
    select: {
      id: true,
      title: true,
      content: true,
      contentJson: true,
      ...SHARE_ACCESS_SELECT,
      owner: {
        select: {
          name: true,
          email: true,
          plan: true,
        },
      },
    },
  });

  if (
    !document ||
    !evaluateShareAccess(toShareAccessInput(document, resolvedShareId, "view"))
      .allow
  ) {
    notFound();
  }

  const ownerName = document.owner.name || document.owner.email.split("@")[0];
  const showAttribution = shouldShowAttribution(document.owner.plan);

  if (document.contentJson == null) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-ds-surface-sunken">
      {/* Header */}
      <header className="border-b border-ds-border-subtle bg-ds-surface-base px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-ds-surface-raised px-2.5 py-0.5 text-xs font-medium text-ds-text-secondary">
              Read-only
            </span>
            <span className="text-xs text-ds-text-muted">
              Shared by {ownerName}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            {document.title}
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <ShareLightbox>
          <article className="rounded-lg border border-ds-border-subtle bg-ds-surface-base p-4 sm:p-6">
            <LexicalReadOnly state={document.contentJson} />
          </article>
        </ShareLightbox>
      </div>
      <MadeWithBadge show={showAttribution} />
    </main>
  );
}
