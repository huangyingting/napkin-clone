"use client";

import { useCallback } from "react";

import type { Deck } from "@/lib/presentation/deck";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { appendPendingPatches } from "./use-slide-editor-commit";
import { emitProductTelemetry } from "@/lib/telemetry/product";

interface UseSlideManagementCommandsOptions {
  deck: Deck;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck, opts?: { coalesceKey?: string }) => void;
  setSelectedIndex: (
    indexOrUpdater: number | ((prev: number) => number),
  ) => void;
}

export function useSlideManagementCommands({
  deck,
  pendingPatchesRef,
  onDeckChange,
  setSelectedIndex,
}: UseSlideManagementCommandsOptions) {
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

  return {
    handleMove,
    handleDuplicate,
    handleRemove,
    handleNotesChange,
  };
}
