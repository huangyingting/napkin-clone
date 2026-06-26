"use client";

import { useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { ElementBox, SlideElement } from "@/lib/presentation/deck";
import { isInlineEditableStageElement } from "@/lib/presentation/stage-interaction";
import {
  clientPointToStagePct,
  defaultTextBoxAtPoint,
} from "@/lib/presentation/canvas-helpers";

interface UseInlineTextEditParams {
  elements: readonly SlideElement[];
  selectedElementId: string | null;
  nextGestureKey: (prefix: string, id: string) => string;
  onSelectElement: (id: string | null) => void;
  onAddTextElement?: (box: ElementBox) => string | null;
  containerRef: RefObject<HTMLDivElement | null>;
}

export interface UseInlineTextEditResult {
  editingId: string | null;
  editCoalesceKey: string | null;
  pendingCaret: { x: number; y: number } | null;
  activeEditingId: string | null;
  editingElement: SlideElement | null;
  startEditing: (
    element: SlideElement,
    caret?: { x: number; y: number } | null,
  ) => void;
  stopEditing: () => void;
  handleStageDoubleClick: (event: React.MouseEvent) => void;
}

/**
 * Manages the inline text editing session on the presentation stage.
 *
 * Owns `editingId`, `editCoalesceKey`, and `pendingCaret` state and exposes
 * `startEditing` / `stopEditing` actions along with the derived
 * `editingElement` and `activeEditingId` values. Also provides
 * `handleStageDoubleClick` which creates a new text element on an empty-canvas
 * double-click.
 */
export function useInlineTextEdit({
  elements,
  selectedElementId,
  nextGestureKey,
  onSelectElement,
  onAddTextElement,
  containerRef,
}: UseInlineTextEditParams): UseInlineTextEditResult {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCoalesceKey, setEditCoalesceKey] = useState<string | null>(null);
  const [pendingCaret, setPendingCaret] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const editingElement = useMemo(
    () =>
      elements.find(
        (element) =>
          element.id === editingId &&
          element.id === selectedElementId &&
          isInlineEditableStageElement(element),
      ) ?? null,
    [elements, editingId, selectedElementId],
  );
  const activeEditingId = editingElement?.id ?? null;

  const startEditing = useCallback(
    (element: SlideElement, caret?: { x: number; y: number } | null) => {
      if (isInlineEditableStageElement(element)) {
        onSelectElement(element.id);
        setEditingId(element.id);
        setEditCoalesceKey(nextGestureKey("edit-text", element.id));
        setPendingCaret(caret ?? null);
      }
    },
    [nextGestureKey, onSelectElement],
  );

  const stopEditing = useCallback(() => {
    setEditingId(null);
    setEditCoalesceKey(null);
    setPendingCaret(null);
  }, []);

  const handleStageDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (activeEditingId || !onAddTextElement) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const { x: xPct, y: yPct } = clientPointToStagePct(
        event.clientX,
        event.clientY,
        rect,
      );
      const box = defaultTextBoxAtPoint(xPct, yPct);
      const newId = onAddTextElement(box);
      if (newId) {
        setEditingId(newId);
        setEditCoalesceKey(nextGestureKey("edit-text", newId));
        setPendingCaret(null);
      }
    },
    [activeEditingId, containerRef, nextGestureKey, onAddTextElement],
  );

  return {
    editingId,
    editCoalesceKey,
    pendingCaret,
    activeEditingId,
    editingElement,
    startEditing,
    stopEditing,
    handleStageDoubleClick,
  };
}
