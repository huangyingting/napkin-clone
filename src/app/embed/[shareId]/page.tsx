import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LexicalReadOnly } from "@/components/lexical/lexical-read-only";
import { MadeWithBadge } from "@/components/made-with-badge";
import { resolvePublicRender } from "@/lib/public-render/resolver";

export const metadata: Metadata = {
  title: "Embedded Document — TextIQ",
};

/**
 * Minimal, chrome-free page for embedding a shared document in an iframe on
 * another site. It mirrors `/share/[shareId]` scoping — it only resolves when
 * the document `isShared` — but renders no header/nav and no auth/session
 * widgets (the global header is suppressed for `/embed/*` by `HeaderGate`). It
 * sets no framing-blocking headers, so it is safe to embed.
 *
 * Documents render read-only from `contentJson` (blocks + inline visuals).
 */
export default async function EmbedPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  const result = await resolvePublicRender({
    params: { shareId },
    mode: "embed",
    projection: "document",
  });

  if (!result.ok || result.projection !== "document") {
    notFound();
  }
  const { document } = result;

  return (
    <main className="min-h-screen w-full bg-ds-surface-base p-4">
      <div className="mx-auto w-full max-w-3xl">
        <LexicalReadOnly state={document.contentJson} />
      </div>
      <MadeWithBadge show={document.showAttribution} />
    </main>
  );
}
