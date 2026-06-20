"use client";

import { Copy, Sparkles, Trash2 } from "lucide-react";

import { IconButton, Tooltip } from "@/components/ui";
import type { VisualKind } from "@/lib/visual/schema";

import { MENU_ITEMS, type MenuSection } from "./visual-context-popover";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface VisualQuickActionBarProps {
  /** The visual kind (reserved for future kind-specific tool filtering). */
  kind: VisualKind;
  /** True when the source text changed since this visual was generated. */
  stale: boolean;
  /** True while an AI variation request is in flight. */
  genLoading: boolean;
  /** Open a section's detail config in the VisualContextPopover. */
  onSelectSection: (section: MenuSection) => void;
  /** Open the AI Variations detail. */
  onGenerate: () => void;
  /** Duplicate this visual node (insert a copy immediately after). */
  onDuplicate: () => void;
  /** Remove this visual node from the document. */
  onDelete: () => void;
}

/**
 * The single on-canvas toolbar overlaid on the top edge of the selected visual
 * card (fine-pointer only; touch uses the EditingRail bottom sheet). It exposes
 * every editing tool as an icon: each section tool opens its detail config in
 * the {@link VisualContextPopover} via `onSelectSection`, while AI variations,
 * duplicate, and delete are direct actions.
 *
 * Mutations flow through Lexical commands / `editor.update()` (wired in
 * {@link VisualCard}) — never Yjs directly. The section tools and the popover
 * detail are one merged surface: this bar is always visible while selected, and
 * the popover only appears once a tool is clicked.
 */
export function VisualQuickActionBar({
  kind,
  stale,
  genLoading,
  onSelectSection,
  onGenerate,
  onDuplicate,
  onDelete,
}: VisualQuickActionBarProps) {
  void kind; // reserved for future kind-specific tool filtering

  return (
    <div
      role="toolbar"
      aria-label="Visual tools"
      className="absolute left-1/2 top-2 z-raised flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border,rgba(0,0,0,0.08))] bg-white/90 px-1 py-1 shadow-sm backdrop-blur-sm"
    >
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Tooltip key={item.id} label={item.label}>
            <span className="relative inline-flex">
              <IconButton
                aria-label={`Open ${item.label}`}
                size="sm"
                variant="subtle"
                onClick={() => onSelectSection(item.id)}
                // Prevent the click from also toggling the card's selection.
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </IconButton>
              {item.id === "sync" && stale ? (
                <span
                  aria-label="Source changed"
                  className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400"
                />
              ) : null}
            </span>
          </Tooltip>
        );
      })}

      <Tooltip label="AI Variations">
        <IconButton
          aria-label="Generate AI variations"
          size="sm"
          variant="subtle"
          onClick={onGenerate}
          disabled={genLoading}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Sparkles
            aria-hidden="true"
            className={`h-4 w-4 ${genLoading ? "animate-pulse" : ""}`}
          />
        </IconButton>
      </Tooltip>

      <span className="ml-1 flex items-center gap-0.5 border-l border-[var(--ds-border,rgba(0,0,0,0.1))] pl-1">
        <Tooltip label="Duplicate visual">
          <IconButton
            aria-label="Duplicate visual"
            size="sm"
            variant="subtle"
            onClick={onDuplicate}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        <Tooltip label="Remove visual">
          <IconButton
            aria-label="Remove visual"
            size="sm"
            variant="danger"
            onClick={onDelete}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      </span>
    </div>
  );
}
