import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LexicalReadOnly } from "@/components/lexical/lexical-read-only";
import { VisualRenderer } from "@/components/visual/visual-renderer";

import { ShareLightbox } from "./share-lightbox";
import { excerpt } from "@/lib/document-stats";
import { prisma } from "@/lib/prisma";
import { buildShareSegment, shareIdFromParam } from "@/lib/slug";
import {
  evaluateShareAccess,
  SHARE_ACCESS_SELECT,
  toShareAccessInput,
} from "@/lib/share-access";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

const SITE_NAME = "TextIQ";

/** Absolute base URL for canonical/OG links. */
function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
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

  // The URL segment may be the legacy bare shareId or the decorative
  // `<slug>-<shareId>` form; resolve the canonical shareId from it.
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
        },
      },
      // Legacy visuals: the document-level one (anchorBlockId = null) and
      // block-anchored ones. Only used for documents that have not yet been
      // migrated to the Lexical `contentJson` format (where visuals live inline
      // as VisualNodes).
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { anchorBlockId: true, data: true },
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

  // Documents authored in the Lexical editor store their full content (blocks
  // and inline visuals) in `contentJson`; render it read-only in one column.
  const hasLexical = document.contentJson != null;

  // For legacy documents (no `contentJson`), parse stored visuals, tolerating
  // garbled data, and split the document-level visual (anchorBlockId = null)
  // from block-anchored ones.
  let visual: Visual | null = null;
  const blockVisuals: Record<string, Visual> = {};
  if (!hasLexical) {
    for (const row of document.visuals) {
      const parsed = safeParseVisual(row.data);
      if (!parsed.success) {
        continue;
      }
      if (row.anchorBlockId === null) {
        visual ??= parsed.data;
      } else if (!(row.anchorBlockId in blockVisuals)) {
        blockVisuals[row.anchorBlockId] = parsed.data;
      }
    }
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
            {hasLexical ? (
              <LexicalReadOnly state={document.contentJson} />
            ) : (
              <>
                <LexicalReadOnly fallbackMarkdown={document.content} />
                {Object.keys(blockVisuals).length > 0 ? (
                  <div className="mt-6 flex flex-col gap-4">
                    {Object.entries(blockVisuals).map(([id, blockVisual]) => (
                      <div
                        key={id}
                        data-block-visual={id}
                        className="w-full min-w-0 overflow-hidden rounded-lg border border-ds-border-subtle bg-ds-surface-base"
                      >
                        <VisualRenderer
                          visual={blockVisual}
                          className="h-auto w-full"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                {visual ? (
                  <div className="mt-6 w-full min-w-0 overflow-hidden rounded-lg border border-ds-border-subtle bg-ds-surface-base">
                    <VisualRenderer visual={visual} className="h-auto w-full" />
                  </div>
                ) : null}
              </>
            )}
          </article>
        </ShareLightbox>
      </div>
    </main>
  );
}
