"use client";

/**
 * Context / Popover Toolbar — floats above the selection bounding box.
 *
 * Renders inside a `FloatingSurface` portal. Position is computed from the
 * selection DOM bounding rect and the stage anchor element.
 *
 * Shows/hides based on selection state:
 *   - Nothing selected → hidden
 *   - In inline edit mode → text format group only
 *   - Single/multi node selected → full contextual group
 */

import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Copy,
  Group,
  Italic,
  SendToBack,
  Trash2,
  Underline,
  Ungroup,
} from "lucide-react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import { FloatingSurface } from "@/components/ui/floating-surface";
import { cx, FOCUS_RING } from "@/components/ui/tokens";
import { dispatchInlineTextCommand } from "@/lib/presentation-vnext/inline-text-commands";

const TOOLBAR_GAP = 10;

// ---------------------------------------------------------------------------
// Toolbar button primitive
// ---------------------------------------------------------------------------

interface TBtnProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TBtn({ label, active, disabled, onClick, children }: TBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-sm,6px)] text-ds-text-secondary transition-colors",
        "hover:bg-ds-state-hover hover:text-ds-text-primary",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-ds-accent-surface text-ds-accent-text",
        FOCUS_RING,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div aria-hidden className="mx-1 h-4 w-px bg-ds-border-subtle" />;
}

// ---------------------------------------------------------------------------
// Position calculation
// ---------------------------------------------------------------------------

/** Reads the bounding rect of the first selected node overlay. */
function getSelectionRect(selectedIds: string[]): DOMRect | null {
  if (typeof document === "undefined" || selectedIds.length === 0) return null;
  const rects: DOMRect[] = [];
  for (const id of selectedIds) {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    if (el) rects.push(el.getBoundingClientRect());
  }
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContextToolbarProps {
  selectedIds: string[];
  selectedNode: SlideChildNode | undefined;
  isInlineEditing: boolean;
  isDragging: boolean;
  isDecorationSelected: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDetachDecoration?: () => void;
}

export function ContextToolbar({
  selectedIds,
  selectedNode,
  isInlineEditing,
  isDragging,
  isDecorationSelected,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  onBringForward,
  onSendBackward,
  onDetachDecoration,
}: ContextToolbarProps): JSX.Element | null {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: -1000, left: -1000 });
  const prevPositionRef = useRef({ top: -1000, left: -1000 });
  const visible = selectedIds.length > 0 && !isDragging;

  // Recompute position when selection or visibility changes.
  // Equality guard prevents setting state when nothing changed, avoiding an
  // infinite render loop (setPosition → re-render → effect → setPosition …).
  useLayoutEffect(() => {
    if (!visible) return;
    const selRect = getSelectionRect(selectedIds);
    if (!selRect) return;
    const toolbarEl = toolbarRef.current;
    const toolbarWidth = toolbarEl?.offsetWidth ?? 240;
    const left = Math.max(
      8,
      selRect.left + selRect.width / 2 - toolbarWidth / 2,
    );
    const top = selRect.top - TOOLBAR_GAP - (toolbarEl?.offsetHeight ?? 36);
    if (
      prevPositionRef.current.top !== top ||
      prevPositionRef.current.left !== left
    ) {
      prevPositionRef.current = { top, left };
      setPosition({ top, left });
    }
  }, [visible, selectedIds]);

  // Also recompute on resize / scroll
  useEffect(() => {
    if (!visible) return;
    const handler = () => {
      const selRect = getSelectionRect(selectedIds);
      if (!selRect) return;
      const toolbarEl = toolbarRef.current;
      const toolbarWidth = toolbarEl?.offsetWidth ?? 240;
      const left = Math.max(
        8,
        selRect.left + selRect.width / 2 - toolbarWidth / 2,
      );
      const top = selRect.top - TOOLBAR_GAP - (toolbarEl?.offsetHeight ?? 36);
      setPosition({ top, left });
    };
    window.addEventListener("resize", handler, { passive: true });
    window.addEventListener("scroll", handler, {
      passive: true,
      capture: true,
    });
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [visible, selectedIds]);

  const isMultiSelect = selectedIds.length > 1;
  const nodeType = selectedNode?.type;

  const showTextGroup =
    isInlineEditing ||
    nodeType === "text" ||
    (nodeType === "shape" && !isMultiSelect);
  const showArrangeGroup = !isInlineEditing && !isDecorationSelected;

  return (
    <FloatingSurface
      open={visible}
      position={position}
      role="toolbar"
      aria-label="Context toolbar"
      layer="dropdown"
      elevation="overlay"
      closeOnClickAway={false}
      closeOnEscape={false}
      keepSelection
      clampToViewport
      className="flex items-center gap-0.5 px-1.5 py-1"
    >
      <div ref={toolbarRef} className="flex items-center gap-0.5">
        {/* Text format group — shown for text/shape nodes and in inline edit mode */}
        {showTextGroup && (
          <>
            <TBtn
              label="Bold"
              onClick={() => dispatchInlineTextCommand({ command: "bold" })}
            >
              <Bold size={13} />
            </TBtn>
            <TBtn
              label="Italic"
              onClick={() => dispatchInlineTextCommand({ command: "italic" })}
            >
              <Italic size={13} />
            </TBtn>
            <TBtn
              label="Underline"
              onClick={() =>
                dispatchInlineTextCommand({ command: "underline" })
              }
            >
              <Underline size={13} />
            </TBtn>
            <Divider />
            <TBtn
              label="Align left"
              onClick={() =>
                dispatchInlineTextCommand({ command: "align-left" })
              }
            >
              <AlignLeft size={13} />
            </TBtn>
            <TBtn
              label="Align center"
              onClick={() =>
                dispatchInlineTextCommand({ command: "align-center" })
              }
            >
              <AlignCenter size={13} />
            </TBtn>
            <TBtn
              label="Align right"
              onClick={() =>
                dispatchInlineTextCommand({ command: "align-right" })
              }
            >
              <AlignRight size={13} />
            </TBtn>
          </>
        )}

        {/* Arrange + action group — hidden in inline edit mode */}
        {showArrangeGroup && (
          <>
            {showTextGroup && <Divider />}

            {isMultiSelect ? (
              <>
                <TBtn
                  label={selectedNode?.type === "group" ? "Ungroup" : "Group"}
                  onClick={selectedNode?.type === "group" ? onUngroup : onGroup}
                  disabled={
                    selectedIds.length < 2 && selectedNode?.type !== "group"
                  }
                >
                  {selectedNode?.type === "group" ? (
                    <Ungroup size={13} />
                  ) : (
                    <Group size={13} />
                  )}
                </TBtn>
                <Divider />
              </>
            ) : null}

            {!isMultiSelect && (
              <>
                <TBtn label="Bring forward" onClick={onBringForward}>
                  <BringToFront size={13} />
                </TBtn>
                <TBtn label="Send backward" onClick={onSendBackward}>
                  <SendToBack size={13} />
                </TBtn>
                <Divider />
              </>
            )}

            <TBtn
              label="Duplicate"
              onClick={onDuplicate}
              disabled={selectedIds.length === 0}
            >
              <Copy size={13} />
            </TBtn>
            <TBtn
              label="Delete"
              onClick={onDelete}
              disabled={selectedIds.length === 0}
            >
              <Trash2 size={13} />
            </TBtn>
          </>
        )}

        {/* Decoration group — shown whenever a theme decoration is selected */}
        {isDecorationSelected && !isInlineEditing && (
          <>
            <Divider />
            <span className="px-1.5 text-[11px] text-ds-text-muted">
              Theme decoration
            </span>
            <button
              type="button"
              className={cx(
                "h-6 rounded-[var(--ds-radius-sm,6px)] border border-ds-border-subtle px-2 text-[11px] font-medium text-ds-text-secondary hover:bg-ds-state-hover",
                FOCUS_RING,
              )}
              onClick={onDetachDecoration}
              aria-label="Detach from theme"
            >
              Detach
            </button>
          </>
        )}
      </div>
    </FloatingSurface>
  );
}
