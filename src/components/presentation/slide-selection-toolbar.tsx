"use client";

import { useState, type ReactNode } from "react";
import {
  BringToFront,
  FileText,
  Grid3x3,
  Image as ImageIcon,
  Minus,
  MoreHorizontal,
  SendToBack,
  Sparkles,
  Type,
} from "lucide-react";

import { ElementToolbarContent } from "@/components/presentation/slide-stage-editor";
import type { ThemeConfig } from "@/components/presentation/slide-canvas";
import { Popover } from "@/components/ui/popover";
import { FOCUS_RING } from "@/components/ui/tokens";
import type { SlideElement } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import {
  isSelectionToolbarVisible,
  shouldShowRichToolbarControls,
  toolbarPanelEntries,
  toToolbarSelectionKind,
} from "@/lib/presentation/slide-panel-ui";

export function SlideSelectionToolbar({
  selectedElement,
  selectedCount,
  theme,
  brandSwatches,
  onUpdateElement,
  onOpenPosition,
  onOpenText,
  onOpenEffects,
  onOpenMedia,
  onOpenSource,
  onDuplicateElement,
  onRemoveElement,
  onBringToFront,
  onSendToBack,
  compact,
}: {
  selectedElement: SlideElement | null;
  selectedCount: number;
  theme: ThemeConfig;
  brandSwatches: readonly string[];
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onOpenPosition: () => void;
  onOpenText: () => void;
  onOpenEffects: () => void;
  onOpenMedia: () => void;
  onOpenSource: () => void;
  onDuplicateElement: (id: string) => void;
  onRemoveElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  compact: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  if (
    !isSelectionToolbarVisible({
      hasSelectedElement: selectedElement !== null,
      selectedCount,
    })
  ) {
    return null;
  }
  const showRich =
    selectedElement !== null &&
    shouldShowRichToolbarControls({
      hasSelectedElement: selectedElement !== null,
      selectedCount,
    });
  const panelEntries = toolbarPanelEntries({
    kind:
      selectedElement !== null
        ? toToolbarSelectionKind(
            selectedElement.kind,
            selectedElement.kind === "shape"
              ? selectedElement.shape
              : undefined,
          )
        : null,
    hasSourceRef: selectedElement?.sourceRef !== undefined,
    selectedCount,
  });
  const canOpenTextPanel = panelEntries.text;
  const canOpenMediaPanel = panelEntries.media;
  const canOpenEffectsPanel = panelEntries.effects;
  const canOpenSourcePanel = panelEntries.source;
  const panelEntry = (label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      {icon}
    </button>
  );
  return (
    <div
      role="toolbar"
      data-floating-panel="true"
      aria-label="Selected slide element tools"
      className="pointer-events-auto absolute left-1/2 top-3 z-sticky flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 overflow-visible rounded-ds-lg border border-ds-border-subtle bg-ds-surface-raised p-1 shadow-ds-popover"
    >
      {showRich && selectedElement ? (
        <ElementToolbarContent
          element={selectedElement}
          tc={theme}
          brandSwatches={brandSwatches}
          onUpdateElement={onUpdateElement}
          onDuplicate={() => onDuplicateElement(selectedElement.id)}
          onBringToFront={() => onBringToFront(selectedElement.id)}
          onSendToBack={() => onSendToBack(selectedElement.id)}
          onRemove={() => onRemoveElement(selectedElement.id)}
          compact={compact}
        />
      ) : null}
      {compact && showRich && selectedElement ? (
        <Popover
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          aria-label="More element actions"
          placement="bottom"
          className="w-44 p-1"
          trigger={
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          }
        >
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                onBringToFront(selectedElement.id);
                setMoreOpen(false);
              }}
              className={`flex items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <BringToFront size={14} aria-hidden="true" />
              Bring to front
            </button>
            <button
              type="button"
              onClick={() => {
                onSendToBack(selectedElement.id);
                setMoreOpen(false);
              }}
              className={`flex items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <SendToBack size={14} aria-hidden="true" />
              Send to back
            </button>
          </div>
        </Popover>
      ) : null}
      {showRich ? (
        <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
      ) : null}
      {canOpenTextPanel
        ? panelEntry(
            "Text settings",
            <Type size={14} aria-hidden="true" />,
            onOpenText,
          )
        : null}
      {canOpenMediaPanel
        ? selectedElement?.kind === "connector"
          ? panelEntry(
              "Line settings",
              <Minus size={14} aria-hidden="true" />,
              onOpenMedia,
            )
          : panelEntry(
              "Media settings",
              <ImageIcon size={14} aria-hidden="true" />,
              onOpenMedia,
            )
        : null}
      {canOpenEffectsPanel
        ? panelEntry(
            "Effects settings",
            <Sparkles size={14} aria-hidden="true" />,
            onOpenEffects,
          )
        : null}
      {canOpenSourcePanel
        ? panelEntry(
            "Source settings",
            <FileText size={14} aria-hidden="true" />,
            onOpenSource,
          )
        : null}
      {panelEntry(
        "Position settings",
        <Grid3x3 size={14} aria-hidden="true" />,
        onOpenPosition,
      )}
    </div>
  );
}
