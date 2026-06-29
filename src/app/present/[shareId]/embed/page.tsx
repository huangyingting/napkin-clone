import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPresentViewerVNext } from "@/components/presentation-vnext/public-present-viewer-vnext";
import { publicShareBudgetExceeded } from "@/app/public-abuse";
import { resolvePublicRender } from "@/lib/public-render/resolver";

export const metadata: Metadata = {
  title: "Presentation — TextIQ",
};

/**
 * Chrome-free embeddable presentation viewer.
 *
 * Mirrors the `/embed/[shareId]` pattern for documents — shares the same
 * access gating (isShared + non-deleted) but renders the deck one slide at a
 * time in a frameless, HUD-minimal layout suitable for `<iframe>` embedding.
 *
 * The global site header is suppressed for all `/present/*` paths by
 * {@link HeaderGate}.
 */
export default async function PresentEmbedPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  if (await publicShareBudgetExceeded()) {
    notFound();
  }

  const result = await resolvePublicRender({
    params: { shareId },
    mode: "present",
    projection: "presentation",
  });

  if (!result.ok || result.projection !== "presentation") {
    notFound();
  }
  const { presentation } = result;

  return (
    <PublicPresentViewerVNext
      deck={presentation.deckV7}
      title={presentation.title}
      embed
      showAttribution={presentation.attribution.showAttribution}
    />
  );
}
