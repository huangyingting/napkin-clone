"use client";

import { useCallback, useState } from "react";

import type {
  Deck,
  SlideLayout as ReusableSlideLayout,
} from "@/lib/presentation/deck";
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

function templateKindForLayout(layout: ReusableSlideLayout): SlideTemplateKind {
  switch (layout.name) {
    case "blank":
      return "blank";
    case "title-slide":
      return "title";
    case "two-column":
      return "two-column";
    case "title-content":
    default:
      return "content";
  }
}

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
  const [pendingResetLayout, setPendingResetLayout] =
    useState<ReusableSlideLayout | null>(null);

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

  const handleApplyReusableLayout = useCallback(
    (layout: ReusableSlideLayout) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "APPLY_SLIDE_TEMPLATE",
        slideId,
        templateId: templateKindForLayout(layout),
      });
      clearSelection();
    },
    [deck, doCommitAndChange, safeSelected, clearSelection],
  );

  const handleResetReusableLayout = useCallback(
    (layout: ReusableSlideLayout) => {
      setPendingResetLayout(layout);
    },
    [],
  );

  const handleConfirmResetLayout = useCallback(() => {
    if (!pendingResetLayout) return;
    if (!deck.slides[safeSelected]) {
      setPendingResetLayout(null);
      return;
    }
    doCommitAndChange(deck, {
      type: "APPLY_SLIDE_TEMPLATE",
      slideId: deck.slides[safeSelected]!.id,
      templateId: templateKindForLayout(pendingResetLayout),
    });
    clearSelection();
    setPendingResetLayout(null);
  }, [
    pendingResetLayout,
    deck,
    doCommitAndChange,
    safeSelected,
    clearSelection,
  ]);

  return {
    pendingResetLayout,
    setPendingResetLayout,
    handleMove,
    handleDuplicate,
    handleRemove,
    handleNotesChange,
    handleApplyReusableLayout,
    handleResetReusableLayout,
    handleConfirmResetLayout,
  };
}
