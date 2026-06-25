import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LexicalReadOnly } from "@/components/lexical/lexical-read-only";
import { MadeWithBadge } from "@/components/made-with-badge";
import { assertAccessDecisionOrNotFound } from "@/lib/access-policy/adapters";
import { prisma } from "@/lib/prisma";
import { shareIdFromParam } from "@/lib/slug";
import {
  evaluateShareAccessDecision,
  SHARE_ACCESS_SELECT,
  toShareAccessInput,
} from "@/lib/share-access";
import { shouldShowAttribution } from "@/lib/billing/attribution";

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

  const resolvedShareId = shareIdFromParam(shareId);

  // Resolve the document by shareId and apply the share-access policy. Embed
  // mode is additionally gated by `shareEmbedEnabled`; a disabled/expired/
  // regenerated link resolves to a safe 404 (issue #101 AC #4).
  const document = await prisma.document.findFirst({
    where: { shareId: resolvedShareId },
    select: {
      title: true,
      contentJson: true,
      ...SHARE_ACCESS_SELECT,
      owner: {
        select: { plan: true },
      },
    },
  });

  if (!document) {
    notFound();
  }
  assertAccessDecisionOrNotFound(
    evaluateShareAccessDecision(
      toShareAccessInput(document, resolvedShareId, "embed"),
    ),
    notFound,
  );

  if (document.contentJson == null) {
    notFound();
  }
  const showAttribution = shouldShowAttribution(document.owner.plan);

  return (
    <main className="min-h-screen w-full bg-ds-surface-base p-4">
      <div className="mx-auto w-full max-w-3xl">
        <LexicalReadOnly state={document.contentJson} />
      </div>
      <MadeWithBadge show={showAttribution} />
    </main>
  );
}
