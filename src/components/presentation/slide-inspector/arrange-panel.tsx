"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  BringToFront,
  Expand,
  MoveHorizontal,
  MoveVertical,
  SendToBack,
  StepBack,
  StepForward,
} from "lucide-react";

import type { SlideInspectorProps } from "./types";
import { LABEL_CLASS, NumberField } from "./primitives";
import { Tooltip, ToolbarButton } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import type { SlideElement } from "@/lib/presentation/deck";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";

/**
 * Shared position & size editor for any element (percent units). Height is only
 * offered for non-text kinds, since text height auto-fits the content.
 */
export function ElementArrangeControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const { x, y, w, h } = element.box;
  const showHeight = element.kind !== "text";
  const rotation = element.rotation ?? 0;
  const update = (patch: Partial<typeof element.box>) =>
    onUpdateElement(element.id, { box: { ...element.box, ...patch } });
  return (
    <div className="mt-3">
      <span className={LABEL_CLASS}>Position &amp; size</span>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X %" value={x} onCommit={(v) => update({ x: v })} />
        <NumberField label="Y %" value={y} onCommit={(v) => update({ y: v })} />
        <NumberField
          label="W %"
          value={w}
          min={1}
          onCommit={(v) => update({ w: v })}
        />
        {showHeight ? (
          <NumberField
            label="H %"
            value={h}
            min={1}
            onCommit={(v) => update({ h: v })}
          />
        ) : null}
        <NumberField
          label="Rotate °"
          value={rotation}
          min={-180}
          max={180}
          onCommit={(v) =>
            onUpdateElement(element.id, { rotation: v === 0 ? undefined : v })
          }
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => update({ x: (100 - w) / 2 })}
          className={`flex-1 rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Center H
        </button>
        <button
          type="button"
          onClick={() => update({ y: (100 - h) / 2 })}
          className={`flex-1 rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Center V
        </button>
      </div>
    </div>
  );
}

/**
 * Multi-select tools panel (issue #328).
 * Shown when 2+ elements are selected. Provides align, distribute, match-size,
 * and arrange operations. All operations are undoable as one history step.
 */
export function MultiSelectTools({
  selectedIds,
  onAlign,
  onDistribute,
  onMatchSize,
  onArrange,
}: {
  selectedIds: string[];
  onAlign?: (ids: string[], mode: AlignMode) => void;
  onDistribute?: (ids: string[], mode: DistributeMode) => void;
  onMatchSize?: (ids: string[], mode: MatchSizeMode) => void;
  onArrange?: (ids: string[], mode: ArrangeMode) => void;
}) {
  const count = selectedIds.length;
  const canDistribute = count >= 3;
  const distributeDisabledReason = "Need 3+ elements to distribute";

  return (
    <div className="mt-2 border-t border-ds-border-subtle pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ds-text-muted">
        {count} elements selected
      </p>
      <div className="flex flex-col gap-2">
        {/* Align */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-ds-text-muted">Align</span>
          <div className="flex items-center gap-0.5">
            <Tooltip label="Align left" side="bottom">
              <ToolbarButton
                aria-label="Align left"
                onClick={() => onAlign?.(selectedIds, "left")}
              >
                <AlignStartHorizontal size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Align center" side="bottom">
              <ToolbarButton
                aria-label="Align center"
                onClick={() => onAlign?.(selectedIds, "hcenter")}
              >
                <AlignCenterHorizontal size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Align right" side="bottom">
              <ToolbarButton
                aria-label="Align right"
                onClick={() => onAlign?.(selectedIds, "right")}
              >
                <AlignEndHorizontal size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Align top" side="bottom">
              <ToolbarButton
                aria-label="Align top"
                onClick={() => onAlign?.(selectedIds, "top")}
              >
                <AlignStartVertical size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Align middle" side="bottom">
              <ToolbarButton
                aria-label="Align middle"
                onClick={() => onAlign?.(selectedIds, "vmiddle")}
              >
                <AlignCenterVertical size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Align bottom" side="bottom">
              <ToolbarButton
                aria-label="Align bottom"
                onClick={() => onAlign?.(selectedIds, "bottom")}
              >
                <AlignEndVertical size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
          </div>
        </div>

        {/* Distribute */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-ds-text-muted">Distribute</span>
          <div className="flex items-center gap-0.5">
            <Tooltip
              label={
                !canDistribute
                  ? distributeDisabledReason
                  : "Distribute horizontally"
              }
              side="bottom"
            >
              <ToolbarButton
                aria-label="Distribute horizontally"
                disabled={!canDistribute}
                onClick={() => onDistribute?.(selectedIds, "horizontal")}
              >
                <AlignHorizontalSpaceBetween size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip
              label={
                !canDistribute
                  ? distributeDisabledReason
                  : "Distribute vertically"
              }
              side="bottom"
            >
              <ToolbarButton
                aria-label="Distribute vertically"
                disabled={!canDistribute}
                onClick={() => onDistribute?.(selectedIds, "vertical")}
              >
                <AlignVerticalSpaceBetween size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
          </div>
        </div>

        {/* Match size */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-ds-text-muted">Match size</span>
          <div className="flex items-center gap-0.5">
            <Tooltip label="Match width" side="bottom">
              <ToolbarButton
                aria-label="Match width"
                onClick={() => onMatchSize?.(selectedIds, "width")}
              >
                <MoveHorizontal size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Match height" side="bottom">
              <ToolbarButton
                aria-label="Match height"
                onClick={() => onMatchSize?.(selectedIds, "height")}
              >
                <MoveVertical size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Match width &amp; height" side="bottom">
              <ToolbarButton
                aria-label="Match width & height"
                onClick={() => onMatchSize?.(selectedIds, "both")}
              >
                <Expand size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
          </div>
        </div>

        {/* Arrange */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-ds-text-muted">Arrange</span>
          <div className="flex items-center gap-0.5">
            <Tooltip label="Send to back" side="bottom">
              <ToolbarButton
                aria-label="Send to back"
                onClick={() => onArrange?.(selectedIds, "back")}
              >
                <SendToBack size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Send backward" side="bottom">
              <ToolbarButton
                aria-label="Send backward"
                onClick={() => onArrange?.(selectedIds, "backward")}
              >
                <StepBack size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Bring forward" side="bottom">
              <ToolbarButton
                aria-label="Bring forward"
                onClick={() => onArrange?.(selectedIds, "forward")}
              >
                <StepForward size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip label="Bring to front" side="bottom">
              <ToolbarButton
                aria-label="Bring to front"
                onClick={() => onArrange?.(selectedIds, "front")}
              >
                <BringToFront size={14} aria-hidden="true" />
              </ToolbarButton>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
