"use client";

import { useCallback } from "react";

import type { Deck, ElementBox } from "@/lib/presentation/deck";
import {
  focusTargetAfterDelete,
  orderedElementIds,
} from "@/lib/presentation/canvas-a11y";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { appendPendingPatches } from "./use-slide-editor-commit";

type DoCommitAndChange = (
  deck: Deck,
  cmd: Parameters<typeof commitCommand>[1],
) => void;

interface UseSlideElementCommandsOptions {
  deck: Deck;
  safeSelected: number;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck, opts?: { coalesceKey?: string }) => void;
  doCommitAndChange: DoCommitAndChange;
  /** Called after element removal to restore focus to the next element. */
  requestElementFocus: (id: string | null) => void;
  /** Selects a single element (from the parent orchestrator). */
  handleSelectElement: (id: string) => void;
  /** Clears the element multi-selection sets. */
  setSelectedElementId: (
    id: string | null | ((prev: string | null) => string | null),
  ) => void;
  setSelectedElementIds: (ids: Set<string>) => void;
}

export function useSlideElementCommands({
  deck,
  safeSelected,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  requestElementFocus,
  handleSelectElement,
  setSelectedElementId,
  setSelectedElementIds,
}: UseSlideElementCommandsOptions) {
  const handleUpdateElement = useCallback(
    (id: string, patch: ElementPatch, coalesceKey?: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "UPDATE_ELEMENT",
        slideId,
        elementId: id,
        patch,
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
    [deck, onDeckChange, pendingPatchesRef, safeSelected],
  );

  const handleSetElementBoxes = useCallback(
    (boxesById: Record<string, ElementBox>, coalesceKey?: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "SET_ELEMENT_BOXES",
        slideId,
        boxesById,
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
    [deck, onDeckChange, pendingPatchesRef, safeSelected],
  );

  const handleSetElementPatches = useCallback(
    (patchesById: Record<string, ElementPatch>, coalesceKey?: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "SET_ELEMENT_PATCHES",
        slideId,
        patchesById,
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
    [deck, onDeckChange, pendingPatchesRef, safeSelected],
  );

  const handleGroupElements = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "GROUP_ELEMENTS",
        slideId,
        elementIds: ids,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleUngroupElements = useCallback(
    (groupId: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, { type: "UNGROUP_ELEMENTS", slideId, groupId });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleRemoveElement = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      const ordered = orderedElementIds(
        deck.slides[safeSelected]?.elements ?? [],
      );
      const focusTarget = focusTargetAfterDelete(ordered, new Set([id]));
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "REMOVE_ELEMENT",
        slideId,
        elementId: id,
      });
      setSelectedElementId(focusTarget);
      setSelectedElementIds(focusTarget ? new Set([focusTarget]) : new Set());
      requestElementFocus(focusTarget);
    },
    [
      deck,
      doCommitAndChange,
      requestElementFocus,
      safeSelected,
      setSelectedElementId,
      setSelectedElementIds,
    ],
  );

  const handleDuplicateElement = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "DUPLICATE_ELEMENT",
        slideId,
        elementId: id,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      const newId = result.affectedElementIds.find(
        (elementId) => elementId !== id,
      );
      if (newId) handleSelectElement(newId);
    },
    [deck, handleSelectElement, onDeckChange, pendingPatchesRef, safeSelected],
  );

  const handleBringToFront = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "BRING_ELEMENT_TO_FRONT",
        slideId,
        elementId: id,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleSendToBack = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SEND_ELEMENT_TO_BACK",
        slideId,
        elementId: id,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleSetElementHidden = useCallback(
    (id: string, hidden: boolean) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_ELEMENT_HIDDEN",
        slideId,
        elementId: id,
        hidden,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleSetElementLocked = useCallback(
    (id: string, locked: boolean) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_ELEMENT_LOCKED",
        slideId,
        elementId: id,
        locked,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleMoveElementZOrder = useCallback(
    (id: string, direction: "up" | "down") => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "MOVE_ELEMENT_ZORDER",
        slideId,
        elementId: id,
        direction,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleRenameElement = useCallback(
    (id: string, name: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "RENAME_ELEMENT",
        slideId,
        elementId: id,
        name,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleReorderElement = useCallback(
    (id: string, targetId: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId || id === targetId) return;
      doCommitAndChange(deck, {
        type: "REORDER_ELEMENT",
        slideId,
        elementId: id,
        targetElementId: targetId,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleAlign = useCallback(
    (ids: string[], mode: AlignMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "ALIGN_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleDistribute = useCallback(
    (ids: string[], mode: DistributeMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "DISTRIBUTE_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleMatchSize = useCallback(
    (ids: string[], mode: MatchSizeMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "MATCH_SIZE_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleArrange = useCallback(
    (ids: string[], mode: ArrangeMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "ARRANGE_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  return {
    handleUpdateElement,
    handleSetElementBoxes,
    handleSetElementPatches,
    handleGroupElements,
    handleUngroupElements,
    handleRemoveElement,
    handleDuplicateElement,
    handleBringToFront,
    handleSendToBack,
    handleSetElementHidden,
    handleSetElementLocked,
    handleMoveElementZOrder,
    handleRenameElement,
    handleReorderElement,
    handleAlign,
    handleDistribute,
    handleMatchSize,
    handleArrange,
  };
}
