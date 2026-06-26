"use client";

/**
 * SlideEditorContext — shared state and handler hub for the slide editor.
 *
 * Mounted once in the slide-editor composition root; deep consumers
 * (SlideStageEditor, SlideInspector, SlideSelectionToolbar) read from this
 * context instead of receiving the values as individually threaded props.
 */

import {
  createContext,
  memo,
  useContext,
  useMemo,
  type CSSProperties,
} from "react";

import type {
  Deck,
  ElementBox,
  Slide,
  SlideLayout as ReusableSlideLayout,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import type { RightPanelTab } from "@/lib/presentation/slide-panel-ui";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";
import type { Size } from "@/lib/presentation/stage-fit";
import type { StaleReason } from "@/lib/presentation/source-link-staleness";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import type { Visual } from "@/lib/visual/schema";
import type { SelectionMode } from "@/components/presentation/slide-stage-editor";

export interface SlideEditorContextValue {
  // ── Deck / slide state ────────────────────────────────────────────────
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  /** Index of the currently-selected slide, clamped to a valid range. */
  safeSelected: number;
  /** The selected slide. Consumers must guard against undefined at the call site. */
  selectedSlide: Slide | undefined;
  selectedTheme: SlideThemeColors;

  // ── Selection ─────────────────────────────────────────────────────────
  slideSelected: boolean;
  effectiveSelectedElementId: string | null;
  effectiveSelectedElementIds: ReadonlySet<string>;
  handleSelectElement: (id: string | null, mode?: SelectionMode) => void;
  handleSelectElements: (ids: string[], additive?: boolean) => void;
  handleSelectSlide: () => void;
  editingElementId: string | null;
  handleEditingElementChange: (elementId: string | null) => void;

  // ── Stage layout ──────────────────────────────────────────────────────
  renderedStageWidth: number;
  renderedStageHeight: number;
  /** Full stage container bounds (used for compact-toolbar threshold). */
  stageBounds: Size;
  snapToGrid: boolean;

  // ── Focus / a11y ──────────────────────────────────────────────────────
  focusRequest: { elementId: string | null; nonce: number } | undefined;
  liveMessage: { text: string; nonce: number } | undefined;

  // ── Shared values ─────────────────────────────────────────────────────
  brandSwatches: readonly string[];
  documentId: string | undefined;
  slideAssetPort: SlideAssetActionPort | undefined;

  // ── Element commands ──────────────────────────────────────────────────
  handleUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  handleSetElementBoxes: (
    boxesById: Record<string, ElementBox>,
    coalesceKey?: string,
  ) => void;
  handleSetElementPatches: (
    patchesById: Record<string, ElementPatch>,
    coalesceKey?: string,
  ) => void;
  handleGroupElements: (ids: string[]) => void;
  handleUngroupElements: (groupId: string) => void;
  handleRemoveElement: (id: string) => void;
  handleDuplicateElement: (id: string) => void;
  handleBringToFront: (id: string) => void;
  handleSendToBack: (id: string) => void;
  handleDuplicateSelectedElements: () => void;
  handleRemoveSelectedElements: () => void;
  handleReplaceSelectedImage: (id: string) => void;
  handleReplaceSelectedVisual: (id: string) => void;
  handleRestyleSelectedVisual: (id: string) => void;
  handleSetElementHidden: (id: string, hidden: boolean) => void;
  handleSetElementLocked: (id: string, locked: boolean) => void;
  handleMoveElementZOrder: (id: string, direction: "up" | "down") => void;
  handleRenameElement: (id: string, name: string) => void;
  handleReorderElement: (id: string, targetId: string) => void;
  handleAlign: (ids: string[], mode: AlignMode) => void;
  handleDistribute: (ids: string[], mode: DistributeMode) => void;
  handleMatchSize: (ids: string[], mode: MatchSizeMode) => void;
  handleArrange: (ids: string[], mode: ArrangeMode) => void;

  // ── Clipboard ─────────────────────────────────────────────────────────
  handleCopyElements: () => void;
  handleCutElements: () => void;
  handlePasteElements: () => void;

  // ── Insert commands ───────────────────────────────────────────────────
  handleAddTextElement: (box: ElementBox) => string | null;

  // ── Slide management ──────────────────────────────────────────────────
  canDelete: boolean;
  handleDuplicateSlide: () => void;
  handleRemoveSlide: () => void;
  handleApplyReusableLayout: (layout: ReusableSlideLayout) => void;
  handleResetReusableLayout: (layout: ReusableSlideLayout) => void;
  /** Update notes for the currently-selected slide. */
  handleNotesChangeForSelected: (value: string, coalesceKey?: string) => void;

  // ── Background / accent commands ──────────────────────────────────────
  handleBackgroundChange: (color: string | undefined) => void;
  handleBackgroundGradientChange: (
    gradient: { from: string; to: string; angle?: number } | undefined,
  ) => void;
  handleBackgroundImageChange: (image: string | undefined) => void;
  handleBackgroundAssetChange: (
    opts: { url: string; assetId: string } | undefined,
  ) => void;
  handleAccentChange: (color: string | undefined) => void;

  // ── Source-link commands ──────────────────────────────────────────────
  staleReasonByElementId: ReadonlyMap<string, StaleReason>;
  handlePanelUpdateFromSource: (id: string) => void;
  handlePanelUnlinkElementSource: (id: string) => void;
  handlePanelRelinkElementSource: (id: string) => void;

  // ── Right panel ───────────────────────────────────────────────────────
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;
  openRightPanel: (tab: RightPanelTab) => void;
  closeRightPanel: () => void;
}

export const SlideEditorContext = createContext<SlideEditorContextValue | null>(
  null,
);

/**
 * Returns the current SlideEditorContext value.
 * Must be called from a component that is rendered inside `SlideEditorContext.Provider`.
 */
export function useSlideEditorContext(): SlideEditorContextValue {
  const ctx = useContext(SlideEditorContext);
  if (ctx === null) {
    throw new Error(
      "useSlideEditorContext must be used within a SlideEditorContext.Provider",
    );
  }
  return ctx;
}

// ── Connected wrapper components ────────────────────────────────────────────
// These live here so the composition root (slide-editor.tsx) can render them
// without any prop drilling; every handler and value is pulled from context.

import { SlideStageEditor } from "@/components/presentation/slide-stage-editor";
import { SlideInspector } from "@/components/presentation/slide-inspector";
import { SlideSelectionToolbar } from "@/components/presentation/slide-editor/selection-toolbar";
import { shouldCollapseToolbar } from "@/lib/presentation/slide-panel-ui";
import { selectSelectedElement } from "@/components/presentation/slide-editor/slide-editor-view-model";

/** Renders SlideStageEditor with all data sourced from SlideEditorContext. */
export const SlideStageEditorFromContext = memo(
  function SlideStageEditorFromContext({
    width,
    height,
  }: {
    width: number;
    height: number;
  }) {
    const {
      selectedSlide,
      deck,
      visuals,
      slideSelected,
      effectiveSelectedElementId,
      effectiveSelectedElementIds,
      handleSelectElement,
      handleSelectElements,
      handleSelectSlide,
      handleEditingElementChange,
      handleUpdateElement,
      handleDuplicateElement,
      handleRemoveElement,
      handleBringToFront,
      handleSendToBack,
      handleCopyElements,
      handleCutElements,
      handlePasteElements,
      handleSetElementBoxes,
      handleSetElementPatches,
      handleGroupElements,
      handleUngroupElements,
      snapToGrid,
      brandSwatches,
      handleAddTextElement,
      focusRequest,
      liveMessage,
    } = useSlideEditorContext();

    if (!selectedSlide) return null;

    return (
      <SlideStageEditor
        slide={selectedSlide}
        deck={deck}
        visuals={visuals}
        width={width}
        height={height}
        slideSelected={slideSelected}
        selectedElementId={effectiveSelectedElementId}
        selectedElementIds={effectiveSelectedElementIds}
        onSelectElement={handleSelectElement}
        onSelectElements={handleSelectElements}
        onSelectSlide={handleSelectSlide}
        onUpdateElement={handleUpdateElement}
        onDuplicateElement={handleDuplicateElement}
        onRemoveElement={handleRemoveElement}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onCopyElements={handleCopyElements}
        onCutElements={handleCutElements}
        onPasteElements={handlePasteElements}
        onSetElementBoxes={handleSetElementBoxes}
        onSetElementPatches={handleSetElementPatches}
        onGroupElements={handleGroupElements}
        onUngroupElements={handleUngroupElements}
        onEditingElementChange={handleEditingElementChange}
        snapToGrid={snapToGrid}
        brandSwatches={brandSwatches}
        onAddTextElement={handleAddTextElement}
        focusRequest={focusRequest}
        liveMessage={liveMessage}
      />
    );
  },
);

/**
 * Renders SlideInspector with all data/handlers sourced from SlideEditorContext.
 * Only layout/config props (`className`, `initialTab`, `onClose`) are accepted
 * as explicit props, since those vary between the desktop panel and the mobile sheet.
 */
export const SlideInspectorFromContext = memo(
  function SlideInspectorFromContext({
    className,
    style,
    initialTab,
    onClose,
  }: {
    className?: string;
    style?: CSSProperties;
    initialTab?: RightPanelTab;
    onClose?: () => void;
  }) {
    const {
      selectedSlide,
      safeSelected,
      deck,
      visuals,
      effectiveSelectedElementId,
      effectiveSelectedElementIds,
      handleSelectElement,
      canDelete,
      handleDuplicateSlide,
      handleRemoveSlide,
      handleApplyReusableLayout,
      handleResetReusableLayout,
      handleNotesChangeForSelected,
      handleUpdateElement,
      handleRemoveElement,
      handleDuplicateElement,
      handleBringToFront,
      handleSendToBack,
      handleSetElementHidden,
      handleSetElementLocked,
      handleMoveElementZOrder,
      handleRenameElement,
      handleReorderElement,
      handleAlign,
      handleDistribute,
      handleMatchSize,
      handleArrange,
      handleBackgroundChange,
      handleBackgroundGradientChange,
      handleBackgroundImageChange,
      handleBackgroundAssetChange,
      handleAccentChange,
      brandSwatches,
      staleReasonByElementId,
      handlePanelUpdateFromSource,
      handlePanelUnlinkElementSource,
      handlePanelRelinkElementSource,
      documentId,
      slideAssetPort,
      setRightPanelTab,
    } = useSlideEditorContext();

    if (!selectedSlide) return null;

    return (
      <SlideInspector
        slide={selectedSlide}
        slideIndex={safeSelected}
        deck={deck}
        visuals={visuals}
        selectedElementId={effectiveSelectedElementId}
        selectedElementIds={effectiveSelectedElementIds}
        onSelectElement={handleSelectElement}
        canDelete={canDelete}
        onDuplicateSlide={handleDuplicateSlide}
        onRemoveSlide={handleRemoveSlide}
        onApplyLayout={handleApplyReusableLayout}
        onResetLayout={handleResetReusableLayout}
        onUpdateNotes={handleNotesChangeForSelected}
        onUpdateElement={handleUpdateElement}
        onRemoveElement={handleRemoveElement}
        onDuplicateElement={handleDuplicateElement}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onSetElementHidden={handleSetElementHidden}
        onSetElementLocked={handleSetElementLocked}
        onMoveElementZOrder={handleMoveElementZOrder}
        onRenameElement={handleRenameElement}
        onReorderElement={handleReorderElement}
        onAlign={handleAlign}
        onDistribute={handleDistribute}
        onMatchSize={handleMatchSize}
        onArrange={handleArrange}
        onBackgroundChange={handleBackgroundChange}
        onBackgroundGradientChange={handleBackgroundGradientChange}
        onBackgroundImageChange={handleBackgroundImageChange}
        onBackgroundAssetChange={handleBackgroundAssetChange}
        onAccentChange={handleAccentChange}
        brandSwatches={brandSwatches}
        sourceStaleReasonById={staleReasonByElementId}
        onUpdateElementFromSource={handlePanelUpdateFromSource}
        onUnlinkElementSource={handlePanelUnlinkElementSource}
        onRelinkElementSource={handlePanelRelinkElementSource}
        documentId={documentId}
        slideAssetPort={slideAssetPort}
        onSelectTab={setRightPanelTab}
        className={className}
        style={style}
        initialTab={initialTab}
        onClose={onClose}
      />
    );
  },
);

/** Renders SlideSelectionToolbar with all data/handlers sourced from SlideEditorContext. */
export const SlideSelectionToolbarFromContext = memo(
  function SlideSelectionToolbarFromContext() {
    const {
      selectedSlide,
      effectiveSelectedElementId,
      effectiveSelectedElementIds,
      selectedTheme,
      brandSwatches,
      handleUpdateElement,
      openRightPanel,
      handleDuplicateElement,
      handleRemoveElement,
      handleBringToFront,
      handleSendToBack,
      handleDuplicateSelectedElements,
      handleRemoveSelectedElements,
      handleReplaceSelectedImage,
      handleReplaceSelectedVisual,
      handleRestyleSelectedVisual,
      handleAlign,
      handleDistribute,
      handleMatchSize,
      handleArrange,
      handleGroupElements,
      handleUngroupElements,
      stageBounds,
      editingElementId,
    } = useSlideEditorContext();

    const selectedElement = useMemo(
      () => selectSelectedElement(selectedSlide, effectiveSelectedElementId),
      [selectedSlide, effectiveSelectedElementId],
    );

    const selectedIds = useMemo(
      () => [...effectiveSelectedElementIds],
      [effectiveSelectedElementIds],
    );
    const selectedGroupId = useMemo(() => {
      const selected = (selectedSlide?.elements ?? []).filter((element) =>
        effectiveSelectedElementIds.has(element.id),
      );
      if (selected.length === 0) return null;
      const groupId = selected[0]?.groupId;
      if (!groupId) return null;
      return selected.every((element) => element.groupId === groupId)
        ? groupId
        : null;
    }, [effectiveSelectedElementIds, selectedSlide?.elements]);
    return (
      <SlideSelectionToolbar
        selectedElement={selectedElement}
        selectedIds={selectedIds}
        selectedCount={effectiveSelectedElementIds.size}
        theme={selectedTheme}
        brandSwatches={brandSwatches}
        onUpdateElement={handleUpdateElement}
        onOpenPanel={openRightPanel}
        onDuplicateElement={handleDuplicateElement}
        onRemoveElement={handleRemoveElement}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onAlignSelected={(mode) => handleAlign(selectedIds, mode)}
        onDistributeSelected={(mode) => handleDistribute(selectedIds, mode)}
        onMatchSizeSelected={(mode) => handleMatchSize(selectedIds, mode)}
        onArrangeSelected={(mode) => handleArrange(selectedIds, mode)}
        onGroupSelected={() => handleGroupElements(selectedIds)}
        onUngroupSelected={() => {
          if (selectedGroupId) handleUngroupElements(selectedGroupId);
        }}
        onDuplicateSelected={handleDuplicateSelectedElements}
        onRemoveSelected={handleRemoveSelectedElements}
        onReplaceImage={handleReplaceSelectedImage}
        onReplaceVisual={handleReplaceSelectedVisual}
        onRestyleVisual={handleRestyleSelectedVisual}
        selectedGroupId={selectedGroupId}
        isEditingText={
          selectedElement?.kind === "text" &&
          selectedElement.id === editingElementId
        }
        compact={shouldCollapseToolbar(stageBounds.width)}
      />
    );
  },
);
