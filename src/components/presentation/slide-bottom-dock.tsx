"use client";

import { LayoutPanelLeft, X } from "lucide-react";
import type React from "react";

import { SpeakerNotesControl } from "@/components/presentation/slide-inspector";
import { Tooltip } from "@/components/ui";
import { Popover } from "@/components/ui/popover";
import { FOCUS_RING } from "@/components/ui/tokens";
import {
  ZOOM_PERCENT_PRESETS,
  zoomToPercent,
} from "@/lib/presentation/stage-fit";

/**
 * Bottom Notes drawer (#634, #648). Speaker notes live here as a workspace
 * band above the dock — not as a right-panel tab — so the right panel stays
 * focused on element/slide editing. The drawer height is user-resizable and
 * remembered across sessions; edits route through the same undoable + autosaved
 * notes command path as before.
 */
export function SlideNotesDrawer({
  notes,
  height,
  onHeightChange,
  onChange,
  onClose,
}: {
  notes: string;
  height: number;
  onHeightChange: (next: number) => void;
  onChange: (value: string, coalesceKey?: string) => void;
  onClose: () => void;
}) {
  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const onMove = (moveEvent: PointerEvent) => {
      // Dragging up (smaller clientY) grows the drawer.
      onHeightChange(startHeight + (startY - moveEvent.clientY));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="flex shrink-0 flex-col border-t border-ds-border-subtle bg-ds-surface-overlay"
      style={{ height }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize notes drawer"
        onPointerDown={handleResizePointerDown}
        className="flex h-2 w-full cursor-row-resize items-center justify-center hover:bg-ds-state-hover"
      >
        <span
          aria-hidden="true"
          className="h-0.5 w-8 rounded-full bg-ds-border-subtle"
        />
      </div>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
          Notes
        </span>
        <button
          type="button"
          aria-label="Close notes"
          onClick={onClose}
          className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <SpeakerNotesControl notes={notes} onChange={onChange} />
      </div>
    </div>
  );
}

export function SlideBottomDock({
  railOpen,
  notesOpen,
  zoom,
  zoomMenuOpen,
  slideLabel,
  onToggleRail,
  onOpenNotes,
  onZoomChange,
  onZoomMenuOpenChange,
}: {
  railOpen: boolean;
  notesOpen: boolean;
  zoom: number;
  zoomMenuOpen: boolean;
  slideLabel: string;
  onToggleRail: () => void;
  onOpenNotes: () => void;
  onZoomChange: (zoom: number) => void;
  onZoomMenuOpenChange: (open: boolean) => void;
}) {
  const zoomPercent = zoomToPercent(zoom);
  const setZoomPercent = (percent: number) => {
    onZoomChange(percent / 100);
    onZoomMenuOpenChange(false);
  };
  // Descending order (largest first) to match the zoom menu in the mockup.
  const presets = [...ZOOM_PERCENT_PRESETS].sort((a, b) => b - a);

  return (
    <div className="shrink-0 bg-ds-surface-sunken">
      <div className="flex min-h-10 items-center justify-center gap-1.5 px-2 py-1">
        <Tooltip
          label={railOpen ? "Hide slide thumbnails" : "Show slide thumbnails"}
          side="top"
        >
          <button
            type="button"
            aria-label={
              railOpen ? "Hide slide thumbnails" : "Show slide thumbnails"
            }
            aria-pressed={railOpen}
            onClick={onToggleRail}
            className={`flex h-8 items-center gap-1.5 rounded-ds-md px-2 text-xs font-semibold transition-colors ${
              railOpen
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            <LayoutPanelLeft size={14} aria-hidden="true" />
            Slides
          </button>
        </Tooltip>
        <button
          type="button"
          aria-pressed={notesOpen}
          onClick={onOpenNotes}
          className={`flex h-8 items-center rounded-ds-md px-2 text-xs font-semibold transition-colors ${
            notesOpen
              ? "bg-ds-accent-surface text-ds-accent-text"
              : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
          } ${FOCUS_RING}`}
        >
          Notes
        </button>
        <span className="hidden truncate text-xs font-medium text-ds-text-muted sm:inline">
          {slideLabel}
        </span>
        <div className="mx-1 h-5 w-px bg-ds-border-subtle" aria-hidden="true" />
        <input
          type="range"
          min={25}
          max={200}
          step={5}
          value={zoomPercent}
          onChange={(event) => onZoomChange(Number(event.target.value) / 100)}
          aria-label="Slide zoom"
          className="w-32 accent-ds-accent"
        />
        <Popover
          open={zoomMenuOpen}
          onClose={() => onZoomMenuOpenChange(false)}
          aria-label="Zoom presets"
          placement="top"
          className="w-16 p-1"
          trigger={
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={zoomMenuOpen}
              onClick={() => onZoomMenuOpenChange(!zoomMenuOpen)}
              className={`h-8 min-w-14 rounded-ds-md px-2 text-xs font-semibold tabular-nums text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              {zoomPercent}%
            </button>
          }
        >
          <div className="flex flex-col">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setZoomPercent(preset)}
                className={`rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${
                  preset === zoomPercent
                    ? "bg-ds-state-hover text-ds-text-primary"
                    : "text-ds-text-secondary"
                } ${FOCUS_RING}`}
              >
                {preset}%
              </button>
            ))}
            <div className="my-1 border-t border-ds-border-subtle" />
            <button
              type="button"
              onClick={() => setZoomPercent(100)}
              className={`rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              Fit
            </button>
          </div>
        </Popover>
      </div>
    </div>
  );
}
