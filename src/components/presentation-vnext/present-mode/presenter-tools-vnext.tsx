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
import type {
  SlideChildNode,
  SlideNode,
} from "@/lib/presentation-vnext/schema";
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

function firstNonEmptyLine(value: string | undefined): string | null {
  if (!value) return null;
  const line = value
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? null;
}

function extractNodeLabel(node: SlideChildNode): string | null {
  if (node.type === "text") {
    return (
      node.content.paragraphs
        .map((paragraph) => paragraph.text.trim())
        .find((paragraph) => paragraph.length > 0) ?? null
    );
  }
  if (node.type === "shape") {
    return (
      node.content.text?.paragraphs
        .map((paragraph) => paragraph.text.trim())
        .find((paragraph) => paragraph.length > 0) ?? null
    );
  }
  if (node.type === "group") {
    for (const child of node.children) {
      const label = extractNodeLabel(child);
      if (label) return label;
    }
  }
  return null;
}

function resolveSlideLabel(
  slide: SlideNode | undefined,
  index: number,
  fallback: string,
): string {
  const named = firstNonEmptyLine(slide?.name);
  if (named) return named;

  if (slide) {
    for (const node of slide.children) {
      if (node.role !== "title") continue;
      const title = extractNodeLabel(node);
      if (title) return title;
    }
    for (const node of slide.children) {
      const label = extractNodeLabel(node);
      if (label) return label;
    }
  }

  const notes = firstNonEmptyLine(slide?.notes);
  if (notes) return notes;

  return `${fallback} ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Slide overview panel — vNext version
// ---------------------------------------------------------------------------

export interface SlideOverviewPanelVNextProps {
  slides: SlideNode[];
  renderTree: ResolvedDeckRenderTree;
  currentIndex: number;
  assetResolver?: (id: string) => string | undefined;
  onJump: (index: number) => void;
  onClose: () => void;
}

export interface PresenterPanelVNextProps {
  currentSlide: SlideNode;
  currentIndex: number;
  total: number;
  nextSlide?: SlideNode;
  nextSlideTree?: ResolvedDeckRenderTree["slides"][number];
  canvas: ResolvedDeckRenderTree["canvas"];
  assetResolver?: (id: string) => string | undefined;
}

export function PresenterPanelVNext({
  currentSlide,
  currentIndex,
  total,
  nextSlide,
  nextSlideTree,
  canvas,
  assetResolver,
}: PresenterPanelVNextProps): JSX.Element {
  const previewAspectRatio =
    canvas.width > 0 && canvas.height > 0
      ? canvas.width / canvas.height
      : 16 / 9;
  const currentSlideLabel = resolveSlideLabel(
    currentSlide,
    currentIndex,
    "Slide",
  );

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden bg-ds-stage px-6 py-4">
      <div className="flex min-w-0 flex-[1.4] flex-col">
        <p className="text-xs font-semibold uppercase tracking-widest text-ds-stage-muted">
          Current slide notes
        </p>
        <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-lg border border-ds-stage-border bg-ds-stage-panel-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-ds-stage-muted">
            Slide {currentIndex + 1} of {total}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ds-stage-text">
            {currentSlideLabel}
          </h2>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {currentSlide.notes ? (
              <p className="whitespace-pre-wrap text-base leading-7 text-ds-stage-text">
                {currentSlide.notes}
              </p>
            ) : (
              <p className="text-sm italic text-ds-stage-muted">
                No speaker notes for this slide.
              </p>
            )}
          </div>
        </div>
      </div>

      {nextSlide && nextSlideTree ? (
        <div className="flex w-64 flex-shrink-0 flex-col">
          <p className="text-xs font-semibold uppercase tracking-widest text-ds-stage-muted">
            Up next
          </p>
          <div
            className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-ds-stage-border"
            style={{ aspectRatio: previewAspectRatio }}
          >
            <div className="h-full w-full overflow-hidden">
              <SlideCanvasVNext
                slide={nextSlideTree}
                canvas={canvas}
                assetResolver={assetResolver}
                preview
              />
            </div>
          </div>
          <p className="mt-2 truncate text-sm text-ds-stage-muted">
            {resolveSlideLabel(nextSlide, currentIndex + 1, "Slide")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SlideOverviewPanelVNext({
  slides,
  renderTree,
  currentIndex,
  assetResolver,
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
              const slideLabel = resolveSlideLabel(
                slides[index],
                index,
                "Untitled slide",
              );
              return (
                <button
                  key={slideTree.id}
                  type="button"
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Jump to slide ${index + 1}, ${slideLabel}`}
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
                      assetResolver={assetResolver}
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
