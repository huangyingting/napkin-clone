"use client";

import { useCallback, useState } from "react";
import type {
  ConnectorAnchor,
  ConnectorEndpoint,
  SlideElement,
} from "@/lib/presentation/deck";
import { detachConnectorEndpoint } from "@/lib/presentation/connector-lifecycle";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";

export type ConnectorAnchorPreview = {
  elementId: string;
  hoveredAnchor: ConnectorAnchor | null;
}[];

interface UseConnectorEditingParams {
  elements: readonly SlideElement[];
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
}

export interface UseConnectorEditingResult {
  anchorPreview: ConnectorAnchorPreview | null;
  setAnchorPreview: React.Dispatch<
    React.SetStateAction<ConnectorAnchorPreview | null>
  >;
  handleDetachConnectorStart: (elementId: string, onClose: () => void) => void;
  handleDetachConnectorEnd: (elementId: string, onClose: () => void) => void;
}

/**
 * Manages connector-specific editing state on the presentation stage.
 *
 * Owns `anchorPreview` — the per-candidate anchor-point overlay shown while
 * dragging a connector endpoint near target elements. The drag hook
 * (`useStageDrag`) writes this state via the returned setter.
 *
 * Also exposes `handleDetachConnectorStart` / `handleDetachConnectorEnd` which
 * convert a bound connector endpoint to a free point, wired into the element
 * context menu.
 */
export function useConnectorEditing({
  elements,
  onUpdateElement,
}: UseConnectorEditingParams): UseConnectorEditingResult {
  const [anchorPreview, setAnchorPreview] =
    useState<ConnectorAnchorPreview | null>(null);

  const handleDetachConnectorStart = useCallback(
    (elementId: string, onClose: () => void) => {
      const el = elements.find((e) => e.id === elementId);
      if (el?.kind !== "connector") return;
      if (!("elementId" in el.content.start)) return;
      const free = detachConnectorEndpoint(
        el.content.start as ConnectorEndpoint,
        elements,
      );
      onUpdateElement(el.id, { content: { ...el.content, start: free } });
      onClose();
    },
    [elements, onUpdateElement],
  );

  const handleDetachConnectorEnd = useCallback(
    (elementId: string, onClose: () => void) => {
      const el = elements.find((e) => e.id === elementId);
      if (el?.kind !== "connector") return;
      if (!("elementId" in el.content.end)) return;
      const free = detachConnectorEndpoint(
        el.content.end as ConnectorEndpoint,
        elements,
      );
      onUpdateElement(el.id, { content: { ...el.content, end: free } });
      onClose();
    },
    [elements, onUpdateElement],
  );

  return {
    anchorPreview,
    setAnchorPreview,
    handleDetachConnectorStart,
    handleDetachConnectorEnd,
  };
}
