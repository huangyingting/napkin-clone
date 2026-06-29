"use client";

/**
 * Presenter tools for vNext present mode.
 *
 * Re-exports the HUD, keyboard-help, and timer components from the existing
 * v6 present-mode (they are data-agnostic). Provides a vNext-specific
 * `SlideOverviewPanelVNext` that accepts `ResolvedDeckRenderTree` instead of
 * a v6 `Deck + visuals` pair.
 */

import { type JSX } from "react";
import { X } from "lucide-react";

import { FOCUS_RING } from "@/components/ui/tokens";
import type { SlideNode } from "@/lib/presentation-vnext/schema";
import type { ResolvedDeckRenderTree } from "@/lib/presentation-vnext/render-tree";

import { SlideCanvasVNext } from "@/components/presentation-vnext/slide-canvas";

// ---------------------------------------------------------------------------
// Re-exports of data-agnostic HUD components
// ---------------------------------------------------------------------------

export {
  KeyboardHelpOverlay,
  PresenterTimer,
  HudButton,
  PresenterToolIcon,
} from "@/components/presentation/present-mode/presenter-tools";

// ---------------------------------------------------------------------------
// Slide overview panel — vNext version
// ---------------------------------------------------------------------------

export interface SlideOverviewPanelVNextProps {
  slides: SlideNode[];
  renderTree: ResolvedDeckRenderTree;
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
}

export function SlideOverviewPanelVNext({
  slides,
  renderTree,
  currentIndex,
  onJump,
  onClose,
}: SlideOverviewPanelVNextProps): JSX.Element {
  const canvasAspectRatio =
    renderTree.canvas.width > 0 && renderTree.canvas.height > 0
      ? renderTree.canvas.width / renderTree.canvas.height
      : 16 / 9;

  return (
    <div
      className="absolute inset-0 z-header flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="present-mode-vnext-overview-title"
        className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ds-inverse-border-subtle bg-ds-inverse-surface p-6 text-ds-inverse-text shadow-ds-overlay backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="present-mode-vnext-overview-title"
              className="text-lg font-semibold"
            >
              Slide overview
            </h2>
            <p className="mt-1 text-sm text-ds-inverse-muted">
              Click any slide to jump there.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close slide overview"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-ds-inverse-muted transition-colors hover:bg-ds-inverse-control-hover hover:text-ds-inverse-text ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {renderTree.slides.map((slideTree, index) => {
              const isCurrent = index === currentIndex;
              const slideLabel =
                slides[index]?.notes?.split("\n")[0]?.trim() ||
                `Slide ${index + 1}`;
              return (
                <button
                  key={slideTree.id}
                  type="button"
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Jump to slide ${index + 1}`}
                  onClick={() => onJump(index)}
                  className={`flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors hover:border-ds-inverse-text ${FOCUS_RING} ${
                    isCurrent
                      ? "border-ds-inverse-text bg-ds-inverse-control"
                      : "border-ds-inverse-border-subtle bg-ds-inverse-control"
                  }`}
                >
                  <div
                    className="overflow-hidden rounded-lg border border-ds-inverse-border-subtle bg-ds-inverse-surface"
                    style={{ aspectRatio: canvasAspectRatio }}
                  >
                    <SlideCanvasVNext
                      slide={slideTree}
                      canvas={renderTree.canvas}
                      preview
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-widest text-ds-inverse-muted">
                        Slide {index + 1}
                      </span>
                      {isCurrent ? (
                        <span className="text-xs font-medium text-ds-inverse-text">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm font-medium text-ds-inverse-text">
                      {slideLabel}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
