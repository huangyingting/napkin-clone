"use client";

import { useCallback, useMemo } from "react";

import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import type { Deck, SourceRef } from "@/lib/presentation/deck";
import { hashDocumentBlock } from "@/lib/presentation/document-block-hash";
import {
  findStaleSourceLinks,
  updateTextElementFromBlock,
  buildRefreshSourceRef,
  type StaleSourceLink,
} from "@/lib/presentation/source-link-staleness";
import { commitCommand } from "@/lib/presentation/slide-commands";

function elementSource(element: unknown): SourceRef | undefined {
  return (element as { source?: SourceRef }).source;
}

type DoCommitAndChange = (
  deck: Deck,
  cmd: Parameters<typeof commitCommand>[1],
) => void;

interface UseSlideSourceLinkCommandsOptions {
  deck: Deck;
  doCommitAndChange: DoCommitAndChange;
  documentBlocks: readonly DocumentBlock[];
  staleSourceLinkCount: number;
}

export function useSlideSourceLinkCommands({
  deck,
  doCommitAndChange,
  documentBlocks,
  staleSourceLinkCount,
}: UseSlideSourceLinkCommandsOptions) {
  const staleLinks = useMemo<StaleSourceLink[]>(() => {
    if (documentBlocks.length === 0 && staleSourceLinkCount === 0) return [];
    return findStaleSourceLinks(deck, documentBlocks);
  }, [deck, documentBlocks, staleSourceLinkCount]);

  const staleReasonByElementId = useMemo(
    () =>
      new Map(staleLinks.map((link) => [link.elementId, link.reason] as const)),
    [staleLinks],
  );

  const handleUpdateFromSource = useCallback(
    (link: StaleSourceLink) => {
      const slideIndex = deck.slides.findIndex((s) => s.id === link.slideId);
      if (slideIndex < 0) return;
      const slide = deck.slides[slideIndex];
      const element = (slide.elements ?? []).find(
        (el) => el.id === link.elementId,
      );
      const currentSource = element ? elementSource(element) : undefined;
      if (!element || !currentSource) return;

      const linkedAt = new Date().toISOString();
      if (link.blockKind === "text") {
        if (element.kind !== "text") return;
        const fresh = documentBlocks.find(
          (b): b is DocumentTextBlock =>
            b.kind === "text" && b.blockId === link.blockId,
        );
        if (!fresh) return;
        const newRef = buildRefreshSourceRef(
          currentSource,
          link.blockId,
          hashDocumentBlock(fresh),
          linkedAt,
          "text",
        );
        const updated = updateTextElementFromBlock(element, fresh, newRef);
        doCommitAndChange(deck, {
          type: "UPDATE_ELEMENT_SOURCE",
          slideId: link.slideId,
          elementId: link.elementId,
          source: newRef,
          text: (updated as any).content?.text,
          ...((updated as any).content?.runs !== undefined
            ? { runs: (updated as any).content.runs }
            : {}),
        });
      } else {
        const fresh = documentBlocks.find(
          (b) => b.kind === "visual" && b.visualId === link.blockId,
        );
        if (!fresh) return;
        const newRef = buildRefreshSourceRef(
          currentSource,
          link.blockId,
          hashDocumentBlock(fresh),
          linkedAt,
          "visual",
        );
        doCommitAndChange(deck, {
          type: "UPDATE_ELEMENT_SOURCE",
          slideId: link.slideId,
          elementId: link.elementId,
          source: newRef,
        });
      }
    },
    [deck, doCommitAndChange, documentBlocks],
  );

  const handleUnlinkSource = useCallback(
    (link: StaleSourceLink) => {
      const slideIndex = deck.slides.findIndex((s) => s.id === link.slideId);
      if (slideIndex < 0) return;
      const slide = deck.slides[slideIndex];
      const element = (slide.elements ?? []).find(
        (el) => el.id === link.elementId,
      );
      if (!element || !elementSource(element)) return;
      doCommitAndChange(deck, {
        type: "UPDATE_ELEMENT_SOURCE",
        slideId: link.slideId,
        elementId: link.elementId,
        unlink: true,
      });
    },
    [deck, doCommitAndChange],
  );

  const handleRelinkSource = useCallback(
    (link: StaleSourceLink, newBlockId: string, newContentHash: string) => {
      const slideIndex = deck.slides.findIndex((s) => s.id === link.slideId);
      if (slideIndex < 0) return;
      const slide = deck.slides[slideIndex];
      const element = (slide.elements ?? []).find(
        (el) => el.id === link.elementId,
      );
      const currentSource = element ? elementSource(element) : undefined;
      if (!element || !currentSource) return;
      const newRef: SourceRef = {
        documentId: currentSource.documentId,
        blockId: newBlockId,
        contentHash: newContentHash,
        linkedAt: new Date().toISOString(),
        blockKind: link.blockKind,
      };
      doCommitAndChange(deck, {
        type: "UPDATE_ELEMENT_SOURCE",
        slideId: link.slideId,
        elementId: link.elementId,
        source: newRef,
      });
    },
    [deck, doCommitAndChange],
  );

  const handlePanelUpdateFromSource = useCallback(
    (elementId: string) => {
      const link = staleLinks.find((l) => l.elementId === elementId);
      if (link) handleUpdateFromSource(link);
    },
    [staleLinks, handleUpdateFromSource],
  );

  const handlePanelUnlinkElementSource = useCallback(
    (elementId: string) => {
      for (const slide of deck.slides) {
        const el = (slide.elements ?? []).find((e) => e.id === elementId);
        if (elementSource(el)) {
          doCommitAndChange(deck, {
            type: "UPDATE_ELEMENT_SOURCE",
            slideId: slide.id,
            elementId,
            unlink: true,
          });
          return;
        }
      }
    },
    [deck, doCommitAndChange],
  );

  const handlePanelRelinkElementSource = useCallback(
    (elementId: string) => {
      for (const slide of deck.slides) {
        const el = (slide.elements ?? []).find((e) => e.id === elementId);
        const ref = elementSource(el);
        if (ref) {
          const newRef: SourceRef = {
            documentId: ref.documentId,
            blockId: ref.blockId,
            ...(ref.contentHash !== undefined
              ? { contentHash: ref.contentHash }
              : {}),
            linkedAt: new Date().toISOString(),
            blockKind: ref.blockKind,
          };
          doCommitAndChange(deck, {
            type: "UPDATE_ELEMENT_SOURCE",
            slideId: slide.id,
            elementId,
            source: newRef,
          });
          return;
        }
      }
    },
    [deck, doCommitAndChange],
  );

  const handleRemoveOrphaned = useCallback(
    (link: StaleSourceLink) => {
      doCommitAndChange(deck, {
        type: "REMOVE_SOURCE_ELEMENT",
        slideId: link.slideId,
        elementId: link.elementId,
      });
    },
    [deck, doCommitAndChange],
  );

  return {
    staleLinks,
    staleReasonByElementId,
    handleUpdateFromSource,
    handleUnlinkSource,
    handleRelinkSource,
    handlePanelUpdateFromSource,
    handlePanelUnlinkElementSource,
    handlePanelRelinkElementSource,
    handleRemoveOrphaned,
  };
}
