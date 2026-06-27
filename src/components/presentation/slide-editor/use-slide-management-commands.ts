"use client";

import { useCallback, useState } from "react";

import type { Deck } from "@/lib/presentation/deck";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { appendPendingPatches } from "./use-slide-editor-commit";
import { emitProductTelemetry } from "@/lib/telemetry/product";
import type { SlideTemplateKind } from "@/lib/presentation/slide-templates";

type DoCommitAndChange = (
  deck: Deck,
  cmd: Parameters<typeof commitCommand>[1],
) => void;

interface UseSlideManagementCommandsOptions {
  deck: Deck;
  safeSelected: number;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck, opts?: { coalesceKey?: string }) => void;
  doCommitAndChange: DoCommitAndChange;
  clearSelection: () => void;
  setSelectedIndex: (
    indexOrUpdater: number | ((prev: number) => number),
  ) => void;
}

export function useSlideManagementCommands({
  deck,
  safeSelected,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  clearSelection,
  setSelectedIndex,
}: UseSlideManagementCommandsOptions) {
  const [pendingTemplateReapply, setPendingTemplateReapply] =
    useState<SlideTemplateKind | null>(null);

  const handleMove = useCallback(
    (index: number, direction: number) => {
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "MOVE_SLIDE",
        slideIndex: index,
        direction,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "move_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(index + (direction > 0 ? 1 : -1));
    },
    [deck, onDeckChange, pendingPatchesRef, setSelectedIndex],
  );

  const handleDuplicate = useCallback(
    (index: number) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "DUPLICATE_SLIDE",
        slideId,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "duplicate_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(index + 1);
    },
    [deck, onDeckChange, pendingPatchesRef, setSelectedIndex],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "REMOVE_SLIDE",
        slideId,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "remove_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex((current) =>
        Math.max(0, Math.min(current, deck.slides.length - 2)),
      );
    },
    [deck, onDeckChange, pendingPatchesRef, setSelectedIndex],
  );

  const handleNotesChange = useCallback(
    (index: number, notes: string, coalesceKey?: string) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "UPDATE_SLIDE_NOTES",
        slideId,
        notes,
        ...(coalesceKey !== undefined ? { coalesceKey } : {}),
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, result.patches);
      onDeckChange(
        result.deck,
        coalesceKey !== undefined
          ? { coalesceKey }
          : result.historyKey !== undefined
            ? { coalesceKey: result.historyKey }
            : undefined,
      );
    },
    [deck, onDeckChange, pendingPatchesRef],
  );

  const handleApplySlideTemplate = useCallback(
    (templateId: SlideTemplateKind) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "APPLY_SLIDE_TEMPLATE",
        slideId,
        templateId,
      });
      clearSelection();
    },
    [deck, doCommitAndChange, safeSelected, clearSelection],
  );

  const handleReapplySlideTemplate = useCallback(
    (templateId: SlideTemplateKind) => {
      setPendingTemplateReapply(templateId);
    },
    [],
  );

  const handleSetSlideMaster = useCallback(
    (masterId: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_MASTER",
        slideId,
        masterId,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleConfirmTemplateReapply = useCallback(() => {
    if (!pendingTemplateReapply) return;
    if (!deck.slides[safeSelected]) {
      setPendingTemplateReapply(null);
      return;
    }
    doCommitAndChange(deck, {
      type: "APPLY_SLIDE_TEMPLATE",
      slideId: deck.slides[safeSelected]!.id,
      templateId: pendingTemplateReapply,
    });
    clearSelection();
    setPendingTemplateReapply(null);
  }, [
    pendingTemplateReapply,
    deck,
    doCommitAndChange,
    safeSelected,
    clearSelection,
  ]);

  return {
    pendingTemplateReapply,
    setPendingTemplateReapply,
    handleMove,
    handleDuplicate,
    handleRemove,
    handleNotesChange,
    handleApplySlideTemplate,
    handleReapplySlideTemplate,
    handleSetSlideMaster,
    handleConfirmTemplateReapply,
  };
}
