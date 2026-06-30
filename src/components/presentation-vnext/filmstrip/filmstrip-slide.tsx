"use client";

/**
 * FilmstripSlide — a single slide cell in the bottom filmstrip.
 *
 * Shows a scaled slide thumbnail, a slide number label, and an
 * action overlay (move ↑/↓, duplicate, delete) on the active slide.
 */

import { type JSX } from "react";
import { Copy, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import type { ResolvedSlideRenderTree } from "@/lib/presentation-vnext/render-tree";
import type { CanvasSpec } from "@/lib/presentation-vnext/types";
import { SlideCanvasVNext } from "../slide-canvas";
import { cx, FOCUS_RING } from "@/components/ui/tokens";

export interface FilmstripSlideProps {
  slideTree: ResolvedSlideRenderTree;
  canvas: CanvasSpec;
  index: number;
  isActive: boolean;
  slideId: string;
  totalSlides: number;
  isDragging?: boolean;
  isInteractive?: boolean;
  assetResolver?: (id: string) => string | undefined;
  onSelect: (index: number) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPointerDown: (
    event: React.PointerEvent<HTMLLIElement>,
    slideId: string,
    index: number,
  ) => void;
}

export function FilmstripSlide({
  slideTree,
  canvas,
  index,
  isActive,
  slideId,
  totalSlides,
  isDragging = false,
  isInteractive = true,
  assetResolver,
  onSelect,
  onMoveLeft,
  onMoveRight,
  onDuplicate,
  onDelete,
  onPointerDown,
}: FilmstripSlideProps): JSX.Element {
  return (
    <li
      role="option"
      aria-selected={isActive}
      aria-label={`Slide ${index + 1}`}
      data-slide-index={index}
      onPointerDown={(e) => onPointerDown(e, slideId, index)}
      className={cx(
        "group relative shrink-0 cursor-pointer select-none rounded-[var(--ds-radius-sm,6px)] border p-1 transition-[opacity,transform,box-shadow,border-color]",
        isActive
          ? "border-ds-accent-border shadow-[0_0_0_2px_var(--ds-accent)]"
          : "border-ds-border-subtle hover:border-ds-border",
        isDragging && "scale-[0.98] opacity-40",
      )}
    >
      {/* Slide number */}
      <span className="mb-1 block text-center text-[10px] font-medium text-ds-text-muted">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <button
        type="button"
        aria-label={`Go to slide ${index + 1}`}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Delete Backspace"
        disabled={!isInteractive}
        tabIndex={isInteractive ? 0 : -1}
        onClick={() => onSelect(index)}
        className={cx("block w-full", FOCUS_RING)}
      >
        <SlideCanvasVNext
          slide={slideTree}
          canvas={canvas}
          assetResolver={assetResolver}
          preview
        />
      </button>

      {/* Action overlay — shown on active slide, hover, or keyboard focus */}
      <div
        className={cx(
          "absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          isActive && "opacity-100",
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Move slide left"
          disabled={!isInteractive || index === 0}
          onClick={(e) => {
            e.stopPropagation();
            onMoveLeft();
          }}
          className="flex h-5 w-5 items-center justify-center rounded-[var(--ds-radius-sm,6px)] bg-ds-surface/90 text-ds-text-muted hover:text-ds-text-primary disabled:opacity-40"
        >
          <ChevronLeft size={10} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Move slide right"
          disabled={!isInteractive || index === totalSlides - 1}
          onClick={(e) => {
            e.stopPropagation();
            onMoveRight();
          }}
          className="flex h-5 w-5 items-center justify-center rounded-[var(--ds-radius-sm,6px)] bg-ds-surface/90 text-ds-text-muted hover:text-ds-text-primary disabled:opacity-40"
        >
          <ChevronRight size={10} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Duplicate slide"
          disabled={!isInteractive}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="flex h-5 w-5 items-center justify-center rounded-[var(--ds-radius-sm,6px)] bg-ds-surface/90 text-ds-text-muted hover:text-ds-text-primary disabled:opacity-40"
        >
          <Copy size={10} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Delete slide"
          disabled={!isInteractive || totalSlides <= 1}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex h-5 w-5 items-center justify-center rounded-[var(--ds-radius-sm,6px)] bg-ds-surface/90 text-ds-text-muted hover:text-ds-text-primary disabled:opacity-40"
        >
          <Trash2 size={10} aria-hidden />
        </button>
      </div>
    </li>
  );
}
