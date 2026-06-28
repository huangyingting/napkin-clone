"use client";

/**
 * Right-side task-panel router for the slide editor.
 *
 * The inspector renders exactly one active panel at a time. Each panel owns one
 * broad property category — Slide, object-specific editing, Arrange, Effects,
 * Visual, Notes, or Layers — and the available set is computed from the current selection by
 * {@link availablePanels}. A compact in-panel switcher moves between the
 * available panels; it mirrors the toolbar `...` menu and never offers a panel
 * that cannot render.
 *
 * Purely presentational: every change is reported through callbacks; the
 * component never mutates the deck.
 */

import {
  Box,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Link2,
  Lock,
  Minus,
  NotebookPen,
  Shapes,
  Type,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { FOCUS_RING } from "@/components/ui/tokens";
import {
  PropRow,
  FIELD_CLASS,
  PANEL_BODY_CLASS,
  PanelSection,
  SpeakerNotesControl,
} from "@/components/presentation/slide-inspector/primitives";
import { LayerList } from "@/components/presentation/layer-list";
import { Popover, Tooltip } from "@/components/ui";
import type { SlideElement } from "@/lib/presentation/deck";
import { assertNever } from "@/lib/assert-never";
import {
  defaultPanelTab,
  resolvePanelTab,
  toolbarMorePanelLabel,
  toolbarMorePanels,
  toToolbarSelectionKind,
  type PanelAvailabilityContext,
  type RightPanelTab,
} from "@/lib/presentation/slide-panel-ui";
import { ElementArrangeControl } from "@/components/presentation/slide-inspector/controls";
import { EffectsPanel } from "@/components/presentation/slide-inspector/effects-panel";
import { ElementEditor } from "@/components/presentation/slide-inspector/element-editor";
import { ImagePanel } from "@/components/presentation/slide-inspector/image-panel";
import { MultiSelectTools } from "@/components/presentation/slide-inspector/multi-select-tools";
import { ShapePanel } from "@/components/presentation/slide-inspector/shape-panel";
import { TextPanel } from "@/components/presentation/slide-inspector/text-panel";
import { VisualPanel } from "@/components/presentation/slide-inspector/visual-panel";
import { SlidePanelBody } from "@/components/presentation/slide-inspector/slide-panel";
import {
  scaleElementsInBoundingBox,
  selectionBoundingBox,
} from "@/lib/presentation/selection-transform";
import { shapeContent } from "@/components/presentation/slide-canvas/v6-model";

export type {
  AddElementKind,
  SlideInspectorProps,
} from "@/components/presentation/slide-inspector/types";
import type { SlideInspectorProps } from "@/components/presentation/slide-inspector/types";

function elementLabel(element: SlideElement): string {
  const masterChromeKind = (element as { masterChromeKind?: string })
    .masterChromeKind;
  if (masterChromeKind) {
    switch (masterChromeKind) {
      case "logo":
        return "Logo";
      case "footer":
        return "Footer";
      case "pageNumber":
        return "Page #";
      case "watermark":
        return "Watermark";
    }
  }
  switch (element.kind) {
    case "text":
      return (element as { role?: string }).role === "title" ? "Title" : "Text";
    case "visual":
      return "Visual";
    case "image":
      return "Image";
    case "shape":
      return `Shape · ${shapeContent(element).shape}`;
    case "connector":
      return "Connector";
    default:
      return assertNever(element);
  }
}

function MasterChromeIcon({ element }: { element: SlideElement }) {
  const className = "shrink-0 text-ds-accent";
  switch (element.kind) {
    case "text":
      return <Type size={12} className={className} aria-hidden="true" />;
    case "visual":
      return <Box size={12} className={className} aria-hidden="true" />;
    case "image":
      return <ImageIcon size={12} className={className} aria-hidden="true" />;
    case "shape":
      return shapeContent(element).shape === "line" ? (
        <Minus size={12} className={className} aria-hidden="true" />
      ) : (
        <Shapes size={12} className={className} aria-hidden="true" />
      );
    case "connector":
      return <Link2 size={12} className={className} aria-hidden="true" />;
    default:
      return assertNever(element);
  }
}

/**
 * Compact dropdown that switches between the available task panels. Hidden when
 * there is zero or one choice, matching the toolbar `...` menu rules.
 */
function PanelSwitcher({
  panels,
  activeTab,
  availability,
  onSelectTab,
}: {
  panels: readonly RightPanelTab[];
  activeTab: RightPanelTab;
  availability: PanelAvailabilityContext;
  onSelectTab: (tab: RightPanelTab) => void;
}) {
  const [open, setOpen] = useState(false);
  if (panels.length <= 1) return null;
  const activeLabel = toolbarMorePanelLabel(activeTab, availability);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      placement="bottom"
      align="end"
      role="menu"
      aria-label="Switch panel"
      className="w-44 p-1"
      trigger={
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`flex shrink-0 items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
        >
          {activeLabel}
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      }
    >
      <div className="flex flex-col">
        {panels.map((panel) => {
          const active = panel === activeTab;
          const label = toolbarMorePanelLabel(panel, availability);
          return (
            <button
              key={panel}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                onSelectTab(panel);
                setOpen(false);
              }}
              className={`flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-ds-state-hover ${
                active
                  ? "text-ds-text-primary"
                  : "text-ds-text-secondary hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
              {active ? (
                <Check
                  size={13}
                  aria-hidden="true"
                  className="text-ds-accent"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

/** Union position/size editor for a multi-selection (Arrange panel). */
function SelectionBoundsControl({
  elements,
  onUpdateElement,
}: {
  elements: SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const bbox = selectionBoundingBox(elements.map((element) => element.box));
  const updateBounds = (patch: Partial<typeof bbox>) => {
    const nextBox = {
      ...bbox,
      ...patch,
      w: Math.max(1, patch.w ?? bbox.w),
      h: Math.max(1, patch.h ?? bbox.h),
    };
    const nextElements = scaleElementsInBoundingBox(elements, bbox, nextBox);
    for (const element of nextElements) {
      onUpdateElement(element.id, { box: element.box });
    }
  };

  return (
    <>
      <PropRow label="Position">
        <input
          type="number"
          value={bbox.x}
          onChange={(event) => updateBounds({ x: Number(event.target.value) })}
          className={`w-16 text-right ${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Selection X percent"
        />
        <input
          type="number"
          value={bbox.y}
          onChange={(event) => updateBounds({ y: Number(event.target.value) })}
          className={`w-16 text-right ${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Selection Y percent"
        />
      </PropRow>
      <PropRow label="Size">
        <input
          type="number"
          min={1}
          value={bbox.w}
          onChange={(event) => updateBounds({ w: Number(event.target.value) })}
          className={`w-16 text-right ${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Selection width percent"
        />
        <input
          type="number"
          min={1}
          value={bbox.h}
          onChange={(event) => updateBounds({ h: Number(event.target.value) })}
          className={`w-16 text-right ${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Selection height percent"
        />
      </PropRow>
    </>
  );
}

/**
 * Batch effects for a multi-selection. Effects own visual effects only; lock is
 * not a visual effect and lives in Layers.
 */
function SelectionEffectsControl({
  elements,
  onUpdateElement,
}: {
  elements: SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const allShadowed = elements.length > 0 && elements.every((el) => el.shadow);
  return (
    <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
      <input
        type="checkbox"
        checked={allShadowed}
        onChange={(event) => {
          for (const element of elements) {
            onUpdateElement(element.id, {
              shadow: event.target.checked ? true : undefined,
            });
          }
        }}
        className="accent-ds-accent"
      />
      Shadow
    </label>
  );
}

export function SlideInspector({
  slide,
  deck,
  selectedElementId,
  selectedElementIds,
  onSelectElement,
  onUpdateNotes,
  onUpdateElement,
  onAlign,
  onDistribute,
  onMatchSize,
  onArrange,
  onSetElementHidden,
  onSetElementLocked,
  onMoveElementZOrder,
  onRenameElement,
  onReorderElement,
  sourceStaleReasonById,
  onUpdateElementFromSource,
  onUnlinkElementSource,
  onRelinkElementSource,
  onBackgroundChange,
  onBackgroundGradientChange,
  onBackgroundImageChange,
  onBackgroundAssetChange,
  onAccentChange,
  brandSwatches = [],
  className = "flex w-80 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-l border-ds-border-subtle",
  style,
  showAdvanced = true,
  documentId,
  slideAssetPort,
  onClose,
  initialTab,
  onSelectTab,
}: SlideInspectorProps) {
  const elements = useMemo(() => slide.elements ?? [], [slide.elements]);
  const activeMaster = useMemo(() => {
    const masters = deck.masters ?? [];
    return (
      masters.find((master) => master.id === deck.defaultMasterId) ?? masters[0]
    );
  }, [deck.defaultMasterId, deck.masters]);
  const masterElements = activeMaster?.elements ?? [];
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  const selectedElements = useMemo(() => {
    if (!selectedElementIds || selectedElementIds.size === 0) {
      return selectedElement ? [selectedElement] : [];
    }
    return elements.filter((element) => selectedElementIds.has(element.id));
  }, [elements, selectedElement, selectedElementIds]);
  const selectedCount = selectedElements.length;
  const selectedGroupId = useMemo(() => {
    if (selectedElements.length < 2) return null;
    const groupId = selectedElements[0]?.groupId;
    if (!groupId) return null;
    return selectedElements.every((element) => element.groupId === groupId)
      ? groupId
      : null;
  }, [selectedElements]);

  const selectionKind = selectedElement
    ? toToolbarSelectionKind(
        selectedElement.kind,
        selectedElement.kind === "shape"
          ? shapeContent(selectedElement).shape
          : undefined,
      )
    : null;
  const availability = {
    kind: selectedCount >= 2 ? null : selectionKind,
    selectedCount,
    hasSourceRef:
      (selectedElement as { source?: unknown } | null)?.source !== undefined,
  };
  const panels = toolbarMorePanels(availability);

  const requestedTab = initialTab ?? defaultPanelTab(selectedCount > 0);
  const activeTab = resolvePanelTab(requestedTab, availability);

  const objectLabel = selectedGroupId
    ? "Group"
    : selectedCount >= 2
      ? `${selectedCount} selected`
      : selectedElement
        ? elementLabel(selectedElement)
        : "Slide";

  const multiSelectedIds = useMemo(
    () => selectedElements.map((element) => element.id),
    [selectedElements],
  );

  return (
    <aside className={className} style={style}>
      <div className="flex items-center justify-between gap-2 border-b border-ds-border-subtle px-3.5 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ds-text-primary">
          {objectLabel}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {activeTab && onSelectTab ? (
            <PanelSwitcher
              panels={panels}
              activeTab={activeTab}
              availability={availability}
              onSelectTab={onSelectTab}
            />
          ) : null}
          {onClose ? (
            <Tooltip label="Close panel" side="bottom">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div
        className={`${PANEL_BODY_CLASS} ${activeTab === "notes" ? "flex min-h-0 flex-1 flex-col" : ""}`.trim()}
      >
        {activeTab === "slide" ? (
          <SlidePanelBody
            slide={slide}
            deck={deck}
            brandSwatches={brandSwatches}
            showAdvanced={showAdvanced}
            documentId={documentId}
            slideAssetPort={slideAssetPort}
            onBackgroundChange={onBackgroundChange}
            onBackgroundGradientChange={onBackgroundGradientChange}
            onBackgroundImageChange={onBackgroundImageChange}
            onBackgroundAssetChange={onBackgroundAssetChange}
            onAccentChange={onAccentChange}
          />
        ) : null}

        {activeTab === "notes" ? (
          <PanelSection
            title="Speaker notes"
            icon={<NotebookPen size={12} aria-hidden="true" />}
            className="min-h-0 flex-1"
          >
            <SpeakerNotesControl
              notes={slide.notes ?? ""}
              onChange={onUpdateNotes}
            />
          </PanelSection>
        ) : null}

        {activeTab === "layers" ? (
          <div className="flex flex-col gap-2 p-2">
            {masterElements.length > 0 ? (
              <div className="rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
                  Master chrome
                </div>
                <div className="flex flex-wrap gap-1">
                  {masterElements.map((element) => (
                    <span
                      key={element.id}
                      className="inline-flex min-w-0 items-center gap-1 rounded-full bg-ds-surface px-2 py-1 text-xs font-medium text-ds-text-secondary ring-1 ring-ds-border-subtle"
                      title={`${elementLabel(element)} · Locked`}
                    >
                      <MasterChromeIcon element={element} />
                      <span className="min-w-0 max-w-20 truncate">
                        {elementLabel(element)}
                      </span>
                      <Lock
                        size={11}
                        className="shrink-0 text-ds-text-muted"
                        aria-hidden="true"
                      />
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <LayerList
              elements={elements}
              selectedElementId={selectedElementId}
              onSelectElement={onSelectElement}
              onToggleHidden={(id) =>
                onSetElementHidden?.(
                  id,
                  !(elements.find((el) => el.id === id)?.hidden ?? false),
                )
              }
              onToggleLocked={(id) =>
                onSetElementLocked?.(
                  id,
                  !(elements.find((el) => el.id === id)?.locked ?? false),
                )
              }
              onMoveZOrder={(id, direction) =>
                onMoveElementZOrder?.(id, direction)
              }
              onRename={(id, name) => onRenameElement?.(id, name)}
              {...(onReorderElement ? { onReorder: onReorderElement } : {})}
            />
          </div>
        ) : null}

        {activeTab === "text" && selectedElement ? (
          <TextPanel
            element={selectedElement}
            deck={deck}
            slide={slide}
            onUpdateElement={onUpdateElement}
          />
        ) : null}

        {activeTab === "shape" && selectedElement?.kind === "shape" ? (
          <ShapePanel
            element={selectedElement}
            deck={deck}
            slide={slide}
            showAdvanced={showAdvanced}
            onUpdateElement={onUpdateElement}
          />
        ) : null}

        {activeTab === "image" && selectedElement?.kind === "image" ? (
          <ImagePanel
            element={selectedElement}
            deck={deck}
            showAdvanced={showAdvanced}
            onUpdateElement={onUpdateElement}
            documentId={documentId}
            slideAssetPort={slideAssetPort}
          />
        ) : null}

        {activeTab === "line" && selectedElement ? (
          <ElementEditor
            element={selectedElement}
            deck={deck}
            showAdvanced={showAdvanced}
            elements={elements}
            onUpdateElement={onUpdateElement}
            documentId={documentId}
            slideAssetPort={slideAssetPort}
          />
        ) : null}

        {activeTab === "arrange" ? (
          selectedCount >= 2 ? (
            <>
              <PanelSection
                title={
                  selectedGroupId
                    ? "Group actions"
                    : `${selectedCount} selected`
                }
              >
                <MultiSelectTools
                  selectedIds={multiSelectedIds}
                  onAlign={onAlign}
                  onDistribute={onDistribute}
                  onMatchSize={onMatchSize}
                  onArrange={onArrange}
                />
              </PanelSection>
              <PanelSection title="Position &amp; size">
                <SelectionBoundsControl
                  elements={selectedElements}
                  onUpdateElement={onUpdateElement}
                />
              </PanelSection>
            </>
          ) : selectedElement ? (
            <ElementArrangeControl
              element={selectedElement}
              onUpdateElement={onUpdateElement}
            />
          ) : null
        ) : null}

        {activeTab === "effects" ? (
          selectedCount >= 2 ? (
            <PanelSection title="Effects">
              <SelectionEffectsControl
                elements={selectedElements}
                onUpdateElement={onUpdateElement}
              />
            </PanelSection>
          ) : selectedElement ? (
            <EffectsPanel
              element={selectedElement}
              onUpdateElement={onUpdateElement}
            />
          ) : null
        ) : null}

        {(activeTab === "source" || activeTab === "visual") &&
        selectedElement ? (
          <VisualPanel
            element={selectedElement}
            staleReason={sourceStaleReasonById?.get(selectedElement.id)}
            onUpdateFromSource={onUpdateElementFromSource}
            onUnlink={onUnlinkElementSource}
            onRelink={onRelinkElementSource}
          />
        ) : null}
      </div>
    </aside>
  );
}
