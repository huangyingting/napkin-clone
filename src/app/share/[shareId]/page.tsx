import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarkdownPreview } from "@/app/app/documents/[id]/markdown-preview";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { prisma } from "@/lib/prisma";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

export const metadata: Metadata = {
  title: "Shared Document — Napkin Clone",
};

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  // Find the document by shareId and verify it's actually shared.
  const document = await prisma.document.findFirst({
    where: { shareId, isShared: true, deletedAt: null },
    select: {
      id: true,
      title: true,
      content: true,
      owner: {
        select: {
          name: true,
          email: true,
        },
      },
      // All visuals: the document-level one (anchorBlockId = null) renders in its
      // own inline slot; block-anchored visuals render inline beneath their source
      // paragraph in document order (content-first read view).
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { anchorBlockId: true, data: true },
      },
    },
  });

  if (!document) {
    notFound();
  }

  // Parse stored visuals, tolerating legacy/garbled data. Split the
  // document-level visual (anchorBlockId = null) from block-anchored ones.
  let visual: Visual | null = null;
  const blockVisuals: Record<string, Visual> = {};
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

  const ownerName = document.owner.name || document.owner.email.split("@")[0];
  const hasContent = document.content.trim().length > 0;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header — a single blog-width column, matching the content-first editor. */}
      <header className="border-b border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Read-only
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Shared by {ownerName}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {document.title}
          </h1>
        </div>
      </header>

      {/* Content — one centered content-first canvas: the document-level visual in
          its own inline slot, then prose with anchored visuals rendered inline
          beneath their source paragraph (reusing MarkdownPreview + VisualRenderer). */}
      <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-14">
        {hasContent || visual ? (
          <div className="flex flex-col gap-6">
            {visual ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Document visual
                </span>
                <div className="overflow-hidden rounded-xl border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
                  <VisualRenderer visual={visual} className="h-auto w-full" />
                </div>
              </div>
            ) : null}

            {hasContent ? (
              <MarkdownPreview
                source={document.content}
                visuals={blockVisuals}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            This document is empty.
          </p>
        )}
      </div>
    </main>
  );
}
