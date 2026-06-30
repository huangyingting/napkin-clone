"use client";

/**
 * use-filmstrip-drag — pointer drag-to-reorder hook for the bottom filmstrip.
 *
 * On `pointerdown` on a filmstrip cell (identified by `data-slide-index`),
 * tracks pointer movement and computes the target index from DOM bounding
 * rects. Calls `onMoveSlide(slideId, targetIndex)` on `pointerup`.
 */

import { useRef, useState, type RefObject } from "react";

const DRAG_THRESHOLD_PX = 4;
const AUTO_SCROLL_ZONE_PX = 32;
const AUTO_SCROLL_STEP_PX = 14;

export interface UseFilmstripDragOptions {
  /** Called when a slide should be moved to a new index. */
  onMoveSlide: (slideId: string, targetIndex: number) => void;
}

export interface FilmstripDragState {
  isDragging: boolean;
  dragSourceIndex: number | null;
  dragTargetIndex: number | null;
}

export interface UseFilmstripDragResult {
  dragState: FilmstripDragState;
  /** Attach to the filmstrip scroll container. */
  containerRef: RefObject<HTMLOListElement | null>;
  /** Call in the `onPointerDown` handler of each filmstrip cell. */
  onCellPointerDown: (
    event: React.PointerEvent<HTMLLIElement>,
    slideId: string,
    slideIndex: number,
  ) => void;
}

export function useFilmstripDrag({
  onMoveSlide,
}: UseFilmstripDragOptions): UseFilmstripDragResult {
  const containerRef = useRef<HTMLOListElement | null>(null);
  const dragStateRef = useRef<FilmstripDragState>({
    isDragging: false,
    dragSourceIndex: null,
    dragTargetIndex: null,
  });
  const [dragState, setDragState] = useState<FilmstripDragState>({
    isDragging: false,
    dragSourceIndex: null,
    dragTargetIndex: null,
  });

  function onCellPointerDown(
    event: React.PointerEvent<HTMLLIElement>,
    slideId: string,
    slideIndex: number,
  ) {
    // Only left-button drag
    if (event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let moved = false;

    dragStateRef.current = {
      isDragging: false,
      dragSourceIndex: slideIndex,
      dragTargetIndex: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);

    const cells = () =>
      Array.from(
        container.querySelectorAll<HTMLLIElement>("[data-slide-index]"),
      );

    function getTargetIndex(clientX: number): number {
      const allCells = cells();
      for (let i = 0; i < allCells.length; i++) {
        const rect = allCells[i].getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) return i;
      }
      return allCells.length;
    }

    function maybeAutoScroll(clientX: number) {
      const rect = container.getBoundingClientRect();
      if (clientX < rect.left + AUTO_SCROLL_ZONE_PX) {
        container.scrollLeft -= AUTO_SCROLL_STEP_PX;
      } else if (clientX > rect.right - AUTO_SCROLL_ZONE_PX) {
        container.scrollLeft += AUTO_SCROLL_STEP_PX;
      }
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      const movement = Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY,
      );
      if (!moved && movement < DRAG_THRESHOLD_PX) {
        return;
      }
      moved = true;
      moveEvent.preventDefault();
      const idx = getTargetIndex(moveEvent.clientX);
      maybeAutoScroll(moveEvent.clientX);
      dragStateRef.current.isDragging = true;
      dragStateRef.current.dragTargetIndex = idx;
      setDragState({ ...dragStateRef.current });
      // Update visual indicator via CSS attribute on container
      container?.setAttribute("data-drag-target", String(idx));
    }

    function cleanupDrag() {
      dragStateRef.current = {
        isDragging: false,
        dragSourceIndex: null,
        dragTargetIndex: null,
      };
      setDragState({ ...dragStateRef.current });
      container?.removeAttribute("data-drag-target");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    }

    function handlePointerUp(upEvent: PointerEvent) {
      if (!moved) {
        cleanupDrag();
        return;
      }
      upEvent.preventDefault();
      const targetIndex = getTargetIndex(upEvent.clientX);
      if (targetIndex !== slideIndex) {
        onMoveSlide(slideId, targetIndex);
      }
      cleanupDrag();
    }

    function handlePointerCancel() {
      cleanupDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  return {
    dragState,
    containerRef,
    onCellPointerDown,
  };
}
