"use client";

import { useCallback, useMemo, useState } from "react";

import type { SlideElement } from "@/lib/presentation/deck";
import {
  effectiveSlideElementId,
  effectiveSlideElementIds,
} from "@/lib/presentation/slide-selection";

export function useSlideSelection(
  elements: readonly SlideElement[] | undefined,
) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(
    () => new Set(),
  );

  const effectiveSelectedElementId = effectiveSlideElementId(
    elements,
    selectedElementId,
  );
  const effectiveSelectedElementIds = useMemo(
    () => effectiveSlideElementIds(elements, selectedElementIds),
    [elements, selectedElementIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
    setSelectedElementIds(new Set());
  }, []);

  return {
    selectedElementId,
    selectedElementIds,
    setSelectedElementId,
    setSelectedElementIds,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    clearSelection,
  };
}
