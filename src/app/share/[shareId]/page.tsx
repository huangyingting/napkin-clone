import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LexicalReadOnly } from "@/components/lexical/lexical-read-only";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { prisma } from "@/lib/prisma";
import { shareIdFromParam } from "@/lib/slug";
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

  // The URL segment may be the legacy bare shareId or the decorative
  // `<slug>-<shareId>` form; resolve the canonical shareId from it.
  const resolvedShareId = shareIdFromParam(shareId);

  // Find the document by shareId and verify it's actually shared.
  const document = await prisma.document.findFirst({
    where: { shareId: resolvedShareId, isShared: true, deletedAt: null },
    select: {
      id: true,
      title: true,
      content: true,
      contentJson: true,
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

  if (!document) {
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
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="border-b border-black/[.06] bg-white px-6 py-4 dark:border-white/[.08] dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Read-only
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Shared by {ownerName}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {document.title}
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-6 py-8">
        <article className="rounded-lg border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
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
                      className="overflow-hidden rounded-lg border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950"
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
                <div className="mt-6 overflow-hidden rounded-lg border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
                  <VisualRenderer visual={visual} className="h-auto w-full" />
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>
    </main>
  );
}
