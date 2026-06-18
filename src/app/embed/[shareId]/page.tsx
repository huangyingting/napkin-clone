import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { prisma } from "@/lib/prisma";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

export const metadata: Metadata = {
  title: "Embedded Visual — Napkin Clone",
};

/**
 * Minimal, chrome-free page for embedding a shared document's visual(s) in an
 * iframe on another site. It mirrors `/share/[shareId]` scoping — it only
 * resolves when the document `isShared` — but renders no header/nav, no text
 * panel, and no auth/session widgets (the global header is suppressed for
 * `/embed/*` by `HeaderGate`). It sets no framing-blocking headers, so it is
 * safe to embed.
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
    where: { shareId, isShared: true },
    select: {
      title: true,
      // All visuals in document order: the document-level one (anchorBlockId =
      // null) plus every block-anchored visual.
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { anchorBlockId: true, data: true },
      },
    },
  });

  if (!document) {
    notFound();
  }

  // Parse stored visuals, tolerating legacy/garbled rows. Document-level
  // visual(s) first, then block-anchored ones in document order.
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
  const visuals = [...docLevel, ...anchored];

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-white p-4 dark:bg-zinc-950">
      {visuals.length > 0 ? (
        visuals.map((visual, index) => (
          <div key={index} className="w-full max-w-5xl">
            <VisualRenderer
              visual={visual}
              title={document.title}
              className="h-auto w-full"
            />
          </div>
        ))
      ) : (
        <p className="text-sm text-zinc-400 dark:text-zinc-600">
          No visual to display.
        </p>
      )}
    </main>
  );
}
