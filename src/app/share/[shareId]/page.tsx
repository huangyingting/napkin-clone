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
    where: { shareId, isShared: true },
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
      // Get the active visual.
      visuals: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { data: true },
      },
    },
  });

  if (!document) {
    notFound();
  }

  // Parse the visual if present.
  const stored = document.visuals[0]?.data;
  const parsed = stored !== undefined ? safeParseVisual(stored) : null;
  const visual: Visual | null = parsed && parsed.success ? parsed.data : null;

  const ownerName = document.owner.name || document.owner.email.split("@")[0];

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="border-b border-black/[.06] bg-white px-6 py-4 dark:border-white/[.08] dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl">
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
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Text Panel */}
          <section className="rounded-lg border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Text
            </h2>
            {document.content.trim() ? (
              <MarkdownPreview source={document.content} />
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-600">
                No content yet.
              </p>
            )}
          </section>

          {/* Visual Panel */}
          <section className="rounded-lg border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Visual
            </h2>
            {visual ? (
              <div className="flex items-center justify-center">
                <VisualRenderer visual={visual} />
              </div>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-600">
                No visual generated yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
