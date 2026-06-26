"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Deck } from "@/lib/presentation/deck";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { reorderTargetIndex } from "@/lib/presentation/slide-reorder";
import { appendPendingPatches } from "@/components/presentation/slide-editor/use-slide-editor-commit";

interface SlideRailControllerOptions {
  deck: Deck;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck, options?: { coalesceKey?: string }) => void;
  setSelectedIndex: (value: number | ((current: number) => number)) => void;
  setVisualPickerOpen: (open: boolean) => void;
}

interface ReorderPointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  type: string;
}

export function useSlideRailController({
  deck,
  pendingPatchesRef,
  onDeckChange,
  setSelectedIndex,
  setVisualPickerOpen,
}: SlideRailControllerOptions) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    index: number;
    x: number;
    y: number;
    width: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const railListRef = useRef<HTMLUListElement>(null);
  const reorderRef = useRef<{
    fromIndex: number;
    overIndex: number;
    capturedPointerId: number;
    cachedRects: DOMRect[];
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const beginReorder = useCallback(
    (event: React.PointerEvent, index: number) => {
      if (event.button != null && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const list = railListRef.current;
      const items = list
        ? Array.from(list.querySelectorAll<HTMLElement>("[data-slide-thumb]"))
        : [];
      const cachedRects = items.map((item) => item.getBoundingClientRect());
      const sourceRect = cachedRects[index];
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      reorderRef.current = {
        fromIndex: index,
        overIndex: index,
        capturedPointerId: event.pointerId,
        cachedRects,
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: sourceRect ? event.clientX - sourceRect.left : 0,
        offsetY: sourceRect ? event.clientY - sourceRect.top : 0,
        moved: false,
      };
      setDragPreview(null);
      setDragIndex(index);
      setDragOverIndex(index);
    },
    [],
  );

  const updateReorder = useCallback((event: ReorderPointerEvent) => {
    const drag = reorderRef.current;
    if (!drag || event.pointerId !== drag.capturedPointerId) {
      return;
    }
    const movement = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
    );
    if (!drag.moved && movement < 4) {
      return;
    }
    drag.moved = true;
    const rects = drag.cachedRects;
    if (rects.length === 0) {
      return;
    }
    const vertical =
      rects.length < 2 ||
      Math.abs(rects[1].top - rects[0].top) >=
        Math.abs(rects[1].left - rects[0].left);
    const pointer = vertical ? event.clientY : event.clientX;
    const extents = rects.map((rect) =>
      vertical
        ? { start: rect.top, end: rect.bottom }
        : { start: rect.left, end: rect.right },
    );
    const target = reorderTargetIndex(pointer, extents);
    drag.overIndex = target;
    setDragOverIndex(target);
    setDragPreview((preview) =>
      preview
        ? {
            ...preview,
            x: event.clientX - preview.offsetX,
            y: event.clientY - preview.offsetY,
          }
        : rects[drag.fromIndex]
          ? {
              index: drag.fromIndex,
              x: event.clientX - drag.offsetX,
              y: event.clientY - drag.offsetY,
              width: rects[drag.fromIndex].width,
              offsetX: drag.offsetX,
              offsetY: drag.offsetY,
            }
          : null,
    );
  }, []);

  const endReorder = useCallback(
    (event: ReorderPointerEvent) => {
      const drag = reorderRef.current;
      if (!drag || event.pointerId !== drag.capturedPointerId) {
        return;
      }
      reorderRef.current = null;
      if (event.type === "pointercancel") {
        // Clean up visual state only; a cancelled gesture should not select or reorder.
      } else if (!drag.moved) {
        setVisualPickerOpen(false);
        setSelectedIndex(drag.fromIndex);
      } else if (drag.overIndex !== drag.fromIndex) {
        const slideId = deck.slides[drag.fromIndex]?.id;
        if (slideId) {
          const { result, commitOptions, patches } = commitCommand(deck, {
            type: "REORDER_SLIDE",
            slideId,
            toIndex: drag.overIndex,
          });
          if (result.ok) {
            appendPendingPatches(pendingPatchesRef, patches);
            onDeckChange(result.deck, commitOptions);
            setSelectedIndex(drag.overIndex);
          }
        }
      }
      setDragIndex(null);
      setDragOverIndex(null);
      setDragPreview(null);
    },
    [
      deck,
      onDeckChange,
      pendingPatchesRef,
      setSelectedIndex,
      setVisualPickerOpen,
    ],
  );

  useEffect(() => {
    if (dragIndex === null) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateReorder(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      endReorder(event);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragIndex, endReorder, updateReorder]);

  return {
    dragIndex,
    dragOverIndex,
    dragPreview,
    railListRef,
    beginReorder,
    updateReorder,
    endReorder,
  };
}
