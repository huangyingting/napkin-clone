"use client";

import { Copy, LayoutGrid, MoreHorizontal, Palette, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { IconButton, Tooltip } from "@/components/ui";
import type { VisualKind } from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Pure helper — DOM-free, unit-testable
// ---------------------------------------------------------------------------

/** The id of each action shown in the on-canvas quick-action bar. */
export type QuickActionId =
  | "colors"
  | "layout"
  | "duplicate"
  | "delete"
  | "more";

/**
 * Returns the ordered list of quick-action IDs to show for the given visual
 * kind. Currently all kinds share the same set; extracted as a pure function so
 * it can be tested headlessly (no DOM, no React, no Lexical).
 */
export function getQuickActionIds(_kind: VisualKind | string): QuickActionId[] {
  return ["colors", "layout", "duplicate", "delete", "more"];
}

// ---------------------------------------------------------------------------
// Config map (icon + label per action id)
// ---------------------------------------------------------------------------

interface ActionConfig {
  icon: LucideIcon;
  label: string;
}

const ACTION_CONFIG: Record<QuickActionId, ActionConfig> = {
  colors: { icon: Palette, label: "Colors" },
  layout: { icon: LayoutGrid, label: "Swap Layout" },
  duplicate: { icon: Copy, label: "Duplicate visual" },
  delete: { icon: Trash2, label: "Remove visual" },
  more: { icon: MoreHorizontal, label: "More options" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface VisualQuickActionBarProps {
  /** The visual kind — used to determine which actions to show. */
  kind: VisualKind;
  /** Navigate the already-open VisualContextPopover to the Colors section. */
  onColors: () => void;
  /** Navigate the already-open VisualContextPopover to the Swap Layout section. */
  onLayout: () => void;
  /** Duplicate this visual node (insert a copy immediately after). */
  onDuplicate: () => void;
  /** Remove this visual node from the document. */
  onDelete: () => void;
  /** Navigate the already-open VisualContextPopover to the main menu. */
  onMore: () => void;
}

/**
 * A compact, horizontally-aligned action bar overlaid on the top edge of the
 * selected visual card. Visible only when a visual is selected and the primary
 * pointer is fine (gated in the parent {@link VisualCard}).
 *
 * Every mutation (duplicate / delete) flows through Lexical commands /
 * `editor.update()` — the callbacks are wired in `VisualCard`. The Colors /
 * Layout / More buttons navigate the already-open {@link VisualContextPopover}
 * via the `sectionNav` prop.
 */
export function VisualQuickActionBar({
  kind,
  onColors,
  onLayout,
  onDuplicate,
  onDelete,
  onMore,
}: VisualQuickActionBarProps) {
  const ids = getQuickActionIds(kind);

  const handlers: Record<QuickActionId, () => void> = {
    colors: onColors,
    layout: onLayout,
    duplicate: onDuplicate,
    delete: onDelete,
    more: onMore,
  };

  return (
    <div
      role="toolbar"
      aria-label="Quick actions"
      className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border,rgba(0,0,0,0.08))] bg-white/90 px-1 py-1 shadow-sm backdrop-blur-sm"
    >
      {ids.map((id, index) => {
        const { icon: Icon, label } = ACTION_CONFIG[id];
        const isDanger = id === "delete";
        const isSeparated = id === "duplicate";

        return (
          <span
            key={id}
            className={
              isSeparated
                ? "ml-1 flex items-center border-l border-[var(--ds-border,rgba(0,0,0,0.1))] pl-1"
                : undefined
            }
          >
            <Tooltip label={label}>
              <IconButton
                aria-label={label}
                size="sm"
                variant={isDanger ? "danger" : "subtle"}
                onClick={handlers[id]}
                // Prevent click from also activating the card's own click
                // handler (which toggles `open` and would close the controls).
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </span>
        );
      })}
    </div>
  );
}
