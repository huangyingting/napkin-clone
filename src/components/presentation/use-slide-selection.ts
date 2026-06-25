"use client";

import { useCallback, useMemo, useState } from "react";

import type { SlideElement } from "@/lib/presentation/deck";
import {
  effectiveSelectedElementId as resolveEffectiveSelectedElementId,
  effectiveSelectedElementIds as resolveEffectiveSelectedElementIds,
  selectedElementIdList as resolveSelectedElementIdList,
  selectionAfterSet,
  selectionAfterToggle,
} from "@/lib/presentation/slide-selection";
import type { SelectionMode } from "@/components/presentation/slide-stage-editor";

export function useSlideSelection({
  elements,
  openSelectionPanel,
  closeRightPanel,
}: {
  elements: readonly SlideElement[] | undefined;
  openSelectionPanel: () => void;
  closeRightPanel: () => void;
}) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(
    () => new Set(),
  );

  const effectiveSelectedElementId = resolveEffectiveSelectedElementId(
    selectedElementId,
    elements,
  );
  const effectiveSelectedElementIds = useMemo(
    () => resolveEffectiveSelectedElementIds(selectedElementIds, elements),
    [elements, selectedElementIds],
  );

  const selectedElementIdList = useCallback(
    () =>
      resolveSelectedElementIdList(
        effectiveSelectedElementId,
        effectiveSelectedElementIds,
      ),
    [effectiveSelectedElementId, effectiveSelectedElementIds],
  );

  const handleSelectElement = useCallback(
    (id: string | null, mode: SelectionMode = "replace") => {
      if (id == null) {
        setSelectedElementId(null);
        setSelectedElementIds((current) =>
          current.size === 0 ? current : new Set(),
        );
        closeRightPanel();
        return;
      }
      if (mode === "toggle") {
        const next = selectionAfterToggle(
          selectedElementId,
          selectedElementIds,
          id,
        );
        setSelectedElementId(next.primaryId);
        setSelectedElementIds(next.ids);
        if (next.ids.size > 0) {
          openSelectionPanel();
        } else {
          closeRightPanel();
        }
      } else if (mode === "keep") {
        setSelectedElementId(id);
        setSelectedElementIds((current) =>
          current.has(id) ? current : new Set([id]),
        );
        openSelectionPanel();
      } else {
        setSelectedElementId(id);
        setSelectedElementIds(new Set([id]));
        openSelectionPanel();
      }
    },
    [
      closeRightPanel,
      openSelectionPanel,
      selectedElementId,
      selectedElementIds,
    ],
  );

  const handleSelectElements = useCallback(
    (ids: string[], additive = false) => {
      const next = selectionAfterSet(
        selectedElementId,
        selectedElementIds,
        ids,
        additive,
      );
      setSelectedElementIds(next.ids);
      setSelectedElementId(next.primaryId);
      if (next.ids.size > 0) {
        openSelectionPanel();
      } else {
        closeRightPanel();
      }
    },
    [
      closeRightPanel,
      openSelectionPanel,
      selectedElementId,
      selectedElementIds,
    ],
  );

  return {
    selectedElementId,
    selectedElementIds,
    setSelectedElementId,
    setSelectedElementIds,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    selectedElementIdList,
    handleSelectElement,
    handleSelectElements,
  };
}
