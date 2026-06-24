"use client";

/**
 * A small popover picker that lists every document {@link Visual} as a
 * {@link VisualRenderer} thumbnail. Selecting one inserts it onto the current
 * slide (the caller routes the insert through `addElement`/`onDeckChange` so it
 * stays undoable). Shared by the slide editor's stage "Add" bar and the
 * inspector add row so both surfaces offer the same picker. When `visuals` is
 * empty it shows an empty-state hint instead of a broken grid.
 */

import { X } from "lucide-react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type { Visual } from "@/lib/visual/schema";

function visualLabel(id: string, visual: Visual): string {
  const title = visual.title?.trim();
  if (title) {
    return title;
  }
  const kind = visual.type
    ? visual.type.charAt(0).toUpperCase() + visual.type.slice(1)
    : "Visual";
  return `${kind} · ${id.slice(0, 6)}`;
}

export function VisualPicker({
  visuals,
  onPick,
  onClose,
  className = "",
}: {
  visuals: ReadonlyMap<string, Visual>;
  onPick: (visualId: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const entries = [...visuals.entries()];

  return (
    <div
      role="dialog"
      aria-label="Insert document visual"
      className={`z-modal w-72 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-2 shadow-lg ${className}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-ds-text-secondary">
          Insert visual
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close visual picker"
          className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto overflow-x-hidden p-1">
          {entries.map(([id, visual]) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPick(id)}
                aria-label={`Insert ${visualLabel(id, visual)}`}
                title={visualLabel(id, visual)}
                className={`group flex w-full flex-col gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface p-1.5 text-left transition-colors hover:border-ds-control hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm bg-ds-surface-base">
                  <VisualRenderer
                    visual={visual}
                    className="h-full w-full object-contain"
                    transparentBackground
                  />
                </span>
                <span className="truncate text-[11px] text-ds-text-muted">
                  {visualLabel(id, visual)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-6 text-center text-xs text-ds-text-muted">
          This document has no visuals yet. Add a visual in the document to
          place it on a slide.
        </p>
      )}
    </div>
  );
}
