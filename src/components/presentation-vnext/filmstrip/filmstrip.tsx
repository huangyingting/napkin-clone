"use client";

/**
 * Bottom filmstrip — horizontal slide navigation rail.
 *
 * Replaces the legacy left vertical slide rail. Shows slide thumbnails in a
 * horizontal scroll container with keyboard navigation (←/→), drag-to-reorder,
 * and per-slide actions (move, duplicate, delete).
 *
 * Collapsible via a toggle button; collapsed state is persisted in
 * localStorage under `slide-filmstrip-collapsed`.
 */

import { useState, type JSX, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";

import type { ResolvedDeckRenderTree } from "@/lib/presentation-vnext/render-tree";
import { cx, FOCUS_RING } from "@/components/ui/tokens";
import { FilmstripSlide } from "./filmstrip-slide";
import { useFilmstripDrag } from "./use-filmstrip-drag";

const COLLAPSED_KEY = "slide-filmstrip-collapsed";

export interface FilmstripProps {
  renderTree: ResolvedDeckRenderTree;
  activeSlideIndex: number;
  assetResolver?: (id: string) => string | undefined;
  onSelectSlide: (index: number) => void;
  onInsertSlide: () => void;
  onDuplicateSlide: (slideId: string) => void;
  onDeleteSlide: (slideId: string) => void;
  onMoveSlide: (slideId: string, targetIndex: number) => void;
}

export function Filmstrip({
  renderTree,
  activeSlideIndex,
  assetResolver,
  onSelectSlide,
  onInsertSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
}: FilmstripProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  const { containerRef, onCellPointerDown } = useFilmstripDrag({
    onMoveSlide,
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    if (event.key === "ArrowLeft" && activeSlideIndex > 0) {
      event.preventDefault();
      onSelectSlide(activeSlideIndex - 1);
    } else if (
      event.key === "ArrowRight" &&
      activeSlideIndex < renderTree.slides.length - 1
    ) {
      event.preventDefault();
      onSelectSlide(activeSlideIndex + 1);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      const activeSlide = renderTree.slides[activeSlideIndex];
      if (activeSlide && renderTree.slides.length > 1) {
        onDeleteSlide(activeSlide.id);
      }
    }
  }

  return (
    <div
      className="shrink-0 border-t border-ds-border-subtle bg-ds-surface-sunken"
      aria-label="Slide filmstrip"
    >
      {/* Collapsed indicator */}
      {collapsed ? (
        <div className="flex h-8 items-center justify-between px-3">
          <span className="text-[11px] text-ds-text-muted">
            {renderTree.slides.length} slides
          </span>
          <button
            type="button"
            aria-label="Expand filmstrip"
            onClick={toggleCollapsed}
            className={cx(
              "flex h-6 w-6 items-center justify-center rounded-[var(--ds-radius-sm,6px)] text-ds-text-muted hover:text-ds-text-primary",
              FOCUS_RING,
            )}
          >
            <ChevronUp size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative flex h-[104px] items-center gap-0">
          {/* Thumbnails */}
          <ol
            ref={containerRef}
            role="listbox"
            aria-label="Slides"
            aria-orientation="horizontal"
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto px-3 py-2"
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            {renderTree.slides.map((slideTree, index) => {
              const slideId = slideTree.id;
              return (
                <FilmstripSlide
                  key={slideId}
                  slideTree={slideTree}
                  canvas={renderTree.canvas}
                  index={index}
                  isActive={index === activeSlideIndex}
                  slideId={slideId}
                  totalSlides={renderTree.slides.length}
                  assetResolver={assetResolver}
                  onSelect={onSelectSlide}
                  onMoveLeft={() => onMoveSlide(slideId, index - 1)}
                  onMoveRight={() => onMoveSlide(slideId, index + 1)}
                  onDuplicate={() => onDuplicateSlide(slideId)}
                  onDelete={() => onDeleteSlide(slideId)}
                  onPointerDown={onCellPointerDown}
                />
              );
            })}

            {/* Add slide button */}
            <li className="shrink-0" role="none">
              <button
                type="button"
                aria-label="Add slide"
                onClick={onInsertSlide}
                className={cx(
                  "flex h-full min-h-[72px] w-14 items-center justify-center rounded-[var(--ds-radius-sm,6px)] border border-dashed border-ds-border-subtle text-ds-text-muted transition-colors hover:border-ds-border hover:text-ds-text-primary",
                  FOCUS_RING,
                )}
              >
                <Plus size={16} aria-hidden />
              </button>
            </li>
          </ol>

          {/* Collapse toggle */}
          <button
            type="button"
            aria-label="Collapse filmstrip"
            onClick={toggleCollapsed}
            className={cx(
              "mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--ds-radius-sm,6px)] text-ds-text-muted hover:text-ds-text-primary",
              FOCUS_RING,
            )}
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
