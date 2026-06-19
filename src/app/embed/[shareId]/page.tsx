import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LexicalReadOnly } from "@/components/lexical/lexical-read-only";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { prisma } from "@/lib/prisma";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

export const metadata: Metadata = {
  title: "Embedded Document — Napkin Clone",
};

/**
 * Minimal, chrome-free page for embedding a shared document in an iframe on
 * another site. It mirrors `/share/[shareId]` scoping — it only resolves when
 * the document `isShared` — but renders no header/nav and no auth/session
 * widgets (the global header is suppressed for `/embed/*` by `HeaderGate`). It
 * sets no framing-blocking headers, so it is safe to embed.
 *
 * Documents authored in the Lexical editor render read-only from `contentJson`
 * (blocks + inline visuals). Legacy documents fall back to their Markdown
 * `content` plus any stored visuals.
 */
export default async function EmbedPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  // Resolve the document by shareId and verify it is actually shared (same
  // scoping as the read-only share page).
  const document = await prisma.document.findFirst({
    where: { shareId, isShared: true, deletedAt: null },
    select: {
      title: true,
      content: true,
      contentJson: true,
      // Legacy visuals (for documents not yet migrated to Lexical
      // `contentJson`, where visuals live inline as VisualNodes).
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { anchorBlockId: true, data: true },
      },
    },
  });

  if (!document) {
    notFound();
  }

  const hasLexical = document.contentJson != null;

  // For legacy documents, collect stored visuals (document-level first, then
  // block-anchored ones) in document order.
  const legacyVisuals: Visual[] = [];
  if (!hasLexical) {
    const docLevel: Visual[] = [];
    const anchored: Visual[] = [];
    for (const row of document.visuals) {
      const parsed = safeParseVisual(row.data);
      if (!parsed.success) {
        continue;
      }
      if (row.anchorBlockId === null) {
        docLevel.push(parsed.data);
      } else {
        anchored.push(parsed.data);
      }
    }
    legacyVisuals.push(...docLevel, ...anchored);
  }

  return (
    <main className="min-h-screen w-full bg-white p-4 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-3xl">
        {hasLexical ? (
          <LexicalReadOnly state={document.contentJson} />
        ) : document.content.trim() || legacyVisuals.length > 0 ? (
          <>
            <LexicalReadOnly fallbackMarkdown={document.content} />
            {legacyVisuals.length > 0 ? (
              <div className="mt-6 flex flex-col gap-6">
                {legacyVisuals.map((visual, index) => (
                  <div key={index} className="w-full">
                    <VisualRenderer
                      visual={visual}
                      title={document.title}
                      className="h-auto w-full"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            No content to display.
          </p>
        )}
      </div>
    </main>
  );
}
