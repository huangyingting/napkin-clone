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
import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";

function ToolBtn({
  label,
  onClick,
  disabled = false,
  disabledReason,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
}) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
  if (!disabled) {
    return (
      <Tooltip label={label} side="bottom">
        {btn}
      </Tooltip>
    );
  }
  return (
    <Tooltip label={disabledReason ?? label} side="bottom">
      {btn}
    </Tooltip>
  );
}

function ToolRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ds-text-muted">{label}</span>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

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
    <div className="flex flex-col gap-2">
      <ToolRow label="Align">
        <ToolBtn
          label="Align left"
          onClick={() => onAlign?.(selectedIds, "left")}
        >
          <AlignStartHorizontal size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Align center"
          onClick={() => onAlign?.(selectedIds, "hcenter")}
        >
          <AlignCenterHorizontal size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Align right"
          onClick={() => onAlign?.(selectedIds, "right")}
        >
          <AlignEndHorizontal size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Align top"
          onClick={() => onAlign?.(selectedIds, "top")}
        >
          <AlignStartVertical size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Align middle"
          onClick={() => onAlign?.(selectedIds, "vmiddle")}
        >
          <AlignCenterVertical size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Align bottom"
          onClick={() => onAlign?.(selectedIds, "bottom")}
        >
          <AlignEndVertical size={14} aria-hidden="true" />
        </ToolBtn>
      </ToolRow>

      <ToolRow label="Distribute">
        <ToolBtn
          label="Distribute horizontally"
          disabled={!canDistribute}
          disabledReason={distributeDisabledReason}
          onClick={() => onDistribute?.(selectedIds, "horizontal")}
        >
          <AlignHorizontalSpaceBetween size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Distribute vertically"
          disabled={!canDistribute}
          disabledReason={distributeDisabledReason}
          onClick={() => onDistribute?.(selectedIds, "vertical")}
        >
          <AlignVerticalSpaceBetween size={14} aria-hidden="true" />
        </ToolBtn>
      </ToolRow>

      <ToolRow label="Match size">
        <ToolBtn
          label="Match width"
          onClick={() => onMatchSize?.(selectedIds, "width")}
        >
          <MoveHorizontal size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Match height"
          onClick={() => onMatchSize?.(selectedIds, "height")}
        >
          <MoveVertical size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Match width & height"
          onClick={() => onMatchSize?.(selectedIds, "both")}
        >
          <Expand size={14} aria-hidden="true" />
        </ToolBtn>
      </ToolRow>

      <ToolRow label="Arrange">
        <ToolBtn
          label="Send to back"
          onClick={() => onArrange?.(selectedIds, "back")}
        >
          <SendToBack size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Send backward"
          onClick={() => onArrange?.(selectedIds, "backward")}
        >
          <StepBack size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Bring forward"
          onClick={() => onArrange?.(selectedIds, "forward")}
        >
          <StepForward size={14} aria-hidden="true" />
        </ToolBtn>
        <ToolBtn
          label="Bring to front"
          onClick={() => onArrange?.(selectedIds, "front")}
        >
          <BringToFront size={14} aria-hidden="true" />
        </ToolBtn>
      </ToolRow>
    </div>
  );
}
