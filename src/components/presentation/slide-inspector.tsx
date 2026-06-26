"use client";

/**
 * Tabbed inspector for the slide editor.
 *
 * Task panels cover selected-element editing, slide styling, speaker notes,
 * source links, and layer/arrange controls.
 *
 * Speaker notes live in a dedicated inspector tab so slide-level editing stays
 * in the right supplemental panel.
 *
 * Purely presentational: every change is reported through callbacks; the
 * component never mutates the deck.
 */

import { Copy, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/ui/tokens";
import {
  SpeakerNotesControl,
  TabButton,
} from "@/components/presentation/slide-inspector/primitives";
import { LayerList } from "@/components/presentation/layer-list";
import { Tooltip } from "@/components/ui";
import type { SlideElement } from "@/lib/presentation/deck";
import { defaultLayouts } from "@/lib/presentation/deck";
import { assertNever } from "@/lib/assert-never";
import type {
  InspectorMode,
  RightPanelTab,
} from "@/lib/presentation/slide-panel-ui";
import { canAddImage, dataUrlByteSize } from "@/lib/presentation/image-element";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import {
  ColorOverride,
  EffectsPanel,
  ElementArrangeControl,
  ElementEditor,
  MultiSelectTools,
  SourceSummary,
  TextPanel,
} from "@/components/presentation/slide-inspector/controls";
import {
  mergeSwatches,
  tokenSetSwatchColors,
} from "@/lib/presentation/text-style";
import { allThemeTokenSets } from "@/lib/presentation/deck-theme-tokens";
import { resolveSlideThemeColors } from "@/lib/presentation/style-cascade";
import { DEFAULT_SLIDE_FORMAT } from "@/lib/presentation/slide-format";

const BUILT_IN_THEME_TOKEN_SETS = allThemeTokenSets();
const THEME_BACKGROUND_SWATCHES = tokenSetSwatchColors(
  BUILT_IN_THEME_TOKEN_SETS,
  "slideBg",
);
const THEME_ACCENT_SWATCHES = tokenSetSwatchColors(
  BUILT_IN_THEME_TOKEN_SETS,
  "accent",
);

type Panel = RightPanelTab;

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

export type {
  AddElementKind,
  SlideInspectorProps,
} from "@/components/presentation/slide-inspector/types";
import type { SlideInspectorProps } from "@/components/presentation/slide-inspector/types";

function elementLabel(element: SlideElement): string {
  switch (element.kind) {
    case "text":
      return element.textRole === "h1" ? "Title" : "Text";
    case "visual":
      return "Visual";
    case "image":
      return "Image";
    case "shape":
      return `Shape · ${element.shape}`;
    case "connector":
      return "Connector";
    default:
      return assertNever(element);
  }
}

function shouldShowSourceTab(element: SlideElement | null): boolean {
  return element?.sourceRef !== undefined;
}

export function SlideInspector({
  slide,
  slideIndex,
  deck,
  visuals,
  selectedElementId,
  selectedElementIds,
  onSelectElement,
  canDelete,
  onDuplicateSlide,
  onRemoveSlide,
  onApplyLayout,
  onResetLayout,
  onUpdateNotes,
  onUpdateElement,
  onAlign,
  onDistribute,
  onMatchSize,
  onArrange,
  onGroupElements: _onGroupElements,
  onUngroupElements: _onUngroupElements,
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
  showAdvanced = true,
  documentId,
  slideAssetPort,
  onClose,
  initialTab,
  inspectorMode = "properties",
  onInspectorModeChange,
}: SlideInspectorProps) {
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  const elements = slide.elements ?? [];
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  const canShowTextPanel =
    selectedElement?.kind === "text" ||
    (selectedElement?.kind === "shape" && selectedElement.shape !== "line");
  const canShowEffectsPanel = selectedElement !== null;
  const canShowMediaPanel =
    selectedElement?.kind === "image" ||
    selectedElement?.kind === "visual" ||
    selectedElement?.kind === "connector";
  const canShowSourcePanel = shouldShowSourceTab(selectedElement);
  const requestedPanel = initialTab ?? "position";
  const panel: Panel =
    (requestedPanel === "text" && !canShowTextPanel) ||
    (requestedPanel === "effects" && !canShowEffectsPanel) ||
    (requestedPanel === "media" && !canShowMediaPanel) ||
    (requestedPanel === "source" && !canShowSourcePanel)
      ? "position"
      : requestedPanel;
  const activePanel: Panel =
    inspectorMode === "properties" &&
    selectedElement === null &&
    panel !== "notes"
      ? "slide"
      : panel;

  function handleModeChange(mode: InspectorMode) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("textiq.slideInspectorMode", mode);
    }
    onInspectorModeChange?.(mode);
  }

  function handleModeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      handleModeChange(
        inspectorMode === "properties" ? "layers" : "properties",
      );
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleModeChange(
        inspectorMode === "properties" ? "layers" : "properties",
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      handleModeChange("properties");
    } else if (event.key === "End") {
      event.preventDefault();
      handleModeChange("layers");
    }
  }

  // Validation error for the background image URL field — only set when the
  // user enters a data URL that is too large or not an image type.
  const [bgImageError, setBgImageError] = useState<string | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  // Background image upload: when documentId + uploadFn are available, attempt
  // server-side upload and persist the assetId via onBackgroundAssetChange.
  // Falls back to the data-URL path so the editor remains usable offline.
  const { handleFile: handleBgImageFile } = useImageUpload({
    deck,
    currentSrc: slide.backgroundImage,
    onAccept: (src, assetId) => {
      setBgImageError(null);
      if (assetId && onBackgroundAssetChange) {
        onBackgroundAssetChange({ url: src, assetId });
      } else {
        handleBackgroundImageChange(src);
      }
    },
    onError: (message) => setBgImageError(message),
    documentId: documentId ?? undefined,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
  });

  function handleBackgroundImageChange(value: string | undefined) {
    if (value?.startsWith("data:")) {
      if (!value.startsWith("data:image/")) {
        setBgImageError("Please enter an image data URL (data:image/…).");
        return;
      }
      // Net change in inlined bytes relative to the current background.
      const addedBytes = value.length - dataUrlByteSize(slide.backgroundImage);
      if (addedBytes > 0) {
        const budget = canAddImage(deck, addedBytes);
        if (!budget.ok) {
          const usedMb = (budget.totalBytes / (1024 * 1024)).toFixed(1);
          setBgImageError(
            `Deck image storage is full (${usedMb} MB). Remove an image or use a smaller file.`,
          );
          return;
        }
      }
    }
    setBgImageError(null);
    onBackgroundImageChange(value);
  }

  const builtInLayouts = useMemo(() => defaultLayouts(), []);
  const availableLayouts = useMemo(() => {
    const source =
      deck.layouts && deck.layouts.length > 0 ? deck.layouts : builtInLayouts;
    const format = deck.slideFormat ?? DEFAULT_SLIDE_FORMAT;
    const filtered = source.filter((layout) => layout.format === format);
    return filtered.length > 0 ? filtered : source;
  }, [builtInLayouts, deck.layouts, deck.slideFormat]);
  const selectedLayout =
    availableLayouts.find((layout) => layout.id === selectedLayoutId) ??
    availableLayouts[0] ??
    null;

  const themeColors = resolveSlideThemeColors(deck, slide);
  const identityLabel =
    inspectorMode === "layers"
      ? "Layers"
      : selectedElement
        ? elementLabel(selectedElement)
        : "Slide";

  return (
    <aside className={className}>
      <div className="flex items-center justify-between border-b border-ds-border-subtle px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ds-text-muted">
            Slide {slideIndex + 1}
          </p>
          <h3 className="text-sm font-semibold text-ds-text-primary">
            {identityLabel}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Right panel mode"
            className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5"
          >
            <TabButton
              active={inspectorMode === "properties"}
              tabId="inspector-mode-properties"
              panelId="inspector-panel-properties"
              label="Properties"
              onClick={() => handleModeChange("properties")}
              onKeyDown={handleModeKeyDown}
            />
            <TabButton
              active={inspectorMode === "layers"}
              tabId="inspector-mode-layers"
              panelId="inspector-panel-layers"
              label="Layers"
              onClick={() => handleModeChange("layers")}
              onKeyDown={handleModeKeyDown}
            />
          </div>
          <Tooltip label="Duplicate slide" side="bottom">
            <button
              type="button"
              onClick={onDuplicateSlide}
              aria-label="Duplicate slide"
              className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Delete slide" side="bottom">
            <button
              type="button"
              onClick={onRemoveSlide}
              disabled={!canDelete}
              aria-label="Delete slide"
              className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </Tooltip>
          {onClose ? (
            <Tooltip label="Close panel" side="bottom">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close properties panel"
                className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div
        id={
          inspectorMode === "layers"
            ? "inspector-panel-layers"
            : "inspector-panel-properties"
        }
        className="flex flex-col gap-4 px-4 py-4"
      >
        {inspectorMode === "properties" && activePanel === "position" ? (
          <div
            role="tabpanel"
            id="inspector-panel-arrange"
            aria-labelledby="inspector-mode-properties"
            className="flex flex-col gap-4"
          >
            {selectedElementIds && selectedElementIds.size >= 2 ? (
              <MultiSelectTools
                selectedIds={[...selectedElementIds]}
                onAlign={onAlign}
                onDistribute={onDistribute}
                onMatchSize={onMatchSize}
                onArrange={onArrange}
              />
            ) : selectedElement ? (
              <ElementArrangeControl
                element={selectedElement}
                onUpdateElement={onUpdateElement}
              />
            ) : null}
          </div>
        ) : null}

        {inspectorMode === "layers" ? (
          <div
            role="tabpanel"
            id="inspector-panel-layers"
            aria-labelledby="inspector-mode-layers"
            className="flex flex-col gap-4"
          >
            <>
              {/* Layer list (issue #331): single rich list with select, rename,
                  visibility, lock, z-order, filter, and drag-reorder (#639). */}
              {(onSetElementHidden ||
                onSetElementLocked ||
                onMoveElementZOrder ||
                onRenameElement) && (
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
              )}
            </>
          </div>
        ) : null}

        {inspectorMode === "properties" && activePanel === "text" ? (
          <div
            role="tabpanel"
            id="inspector-panel-text"
            aria-label="Text settings"
            className="flex flex-col gap-4"
          >
            <TextPanel
              element={selectedElement}
              deck={deck}
              slide={slide}
              onUpdateElement={onUpdateElement}
            />
          </div>
        ) : null}

        {inspectorMode === "properties" && activePanel === "effects" ? (
          <div
            role="tabpanel"
            id="inspector-panel-effects"
            aria-label="Effects settings"
            className="flex flex-col gap-4"
          >
            <EffectsPanel
              element={selectedElement}
              onUpdateElement={onUpdateElement}
            />
          </div>
        ) : null}

        {inspectorMode === "properties" && activePanel === "media" ? (
          <div
            role="tabpanel"
            id="inspector-panel-media"
            aria-label="Media settings"
            className="flex flex-col gap-4"
          >
            {selectedElement ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-ds-text-muted">
                  {elementLabel(selectedElement)}
                </p>
                {selectedElement.kind === "image" ||
                selectedElement.kind === "visual" ||
                selectedElement.kind === "connector" ? (
                  <ElementEditor
                    element={selectedElement}
                    deck={deck}
                    visuals={visuals}
                    showAdvanced={showAdvanced}
                    elements={elements}
                    onUpdateElement={onUpdateElement}
                    documentId={documentId}
                    slideAssetPort={slideAssetPort}
                  />
                ) : (
                  <p className="text-xs text-ds-text-muted">
                    Media settings are available for images, document visuals,
                    and connectors.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-ds-text-muted">
                Select an image or visual to edit media settings.
              </p>
            )}
          </div>
        ) : null}

        {inspectorMode === "properties" && activePanel === "slide" ? (
          <div
            role="tabpanel"
            id="inspector-panel-slide"
            aria-labelledby="inspector-tab-slide"
            className="flex flex-col gap-4"
          >
            {selectedLayout ? (
              <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ds-text-muted">
                  Reusable layout
                </p>
                <label className="block">
                  <span className={LABEL_CLASS}>Layout</span>
                  <select
                    value={selectedLayout.id}
                    onChange={(event) =>
                      setSelectedLayoutId(event.target.value)
                    }
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
                  >
                    {availableLayouts.map((layout) => (
                      <option key={layout.id} value={layout.id}>
                        {layout.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyLayout(selectedLayout)}
                    className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-2 text-sm font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => onResetLayout(selectedLayout)}
                    className={`rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-2 text-sm font-medium text-ds-danger-text hover:opacity-90 ${FOCUS_RING}`}
                  >
                    Reset
                  </button>
                </div>
                <p className="mt-2 text-xs text-ds-text-muted">
                  Apply refreshes placeholders while keeping your other
                  elements. Reset replaces all placeholders with the layout
                  defaults.
                </p>
              </div>
            ) : null}
            <ColorOverride
              label="Background"
              value={slide.background}
              fallback={themeColors.bgColor}
              presets={mergeSwatches(brandSwatches, THEME_BACKGROUND_SWATCHES)}
              onChange={onBackgroundChange}
            />
            <ColorOverride
              label="Accent"
              value={slide.accent}
              fallback={themeColors.accentColor}
              presets={mergeSwatches(brandSwatches, THEME_ACCENT_SWATCHES)}
              onChange={onAccentChange}
            />
            {showAdvanced ? (
              <div className="border-t border-ds-border-subtle pt-3">
                <span
                  className={`${LABEL_CLASS} flex items-center justify-between`}
                >
                  <span>Gradient</span>
                  <input
                    type="checkbox"
                    checked={slide.backgroundGradient !== undefined}
                    onChange={(event) =>
                      onBackgroundGradientChange(
                        event.target.checked
                          ? {
                              from: slide.backgroundGradient?.from ?? "#6366f1",
                              to: slide.backgroundGradient?.to ?? "#ec4899",
                              angle: slide.backgroundGradient?.angle ?? 135,
                            }
                          : undefined,
                      )
                    }
                    className="accent-ds-accent"
                    aria-label="Enable gradient background"
                  />
                </span>
                {slide.backgroundGradient ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      value={slide.backgroundGradient.from}
                      onChange={(event) =>
                        onBackgroundGradientChange({
                          ...slide.backgroundGradient!,
                          from: event.target.value,
                        })
                      }
                      className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
                      aria-label="Gradient start color"
                    />
                    <input
                      type="color"
                      value={slide.backgroundGradient.to}
                      onChange={(event) =>
                        onBackgroundGradientChange({
                          ...slide.backgroundGradient!,
                          to: event.target.value,
                        })
                      }
                      className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
                      aria-label="Gradient end color"
                    />
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={5}
                      value={slide.backgroundGradient.angle ?? 135}
                      onChange={(event) =>
                        onBackgroundGradientChange({
                          ...slide.backgroundGradient!,
                          angle: Number(event.target.value),
                        })
                      }
                      className="flex-1 accent-ds-accent"
                      aria-label="Gradient angle"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <span className={LABEL_CLASS}>Background image</span>
              <button
                type="button"
                onClick={() => bgFileInputRef.current?.click()}
                className={`flex w-full items-center justify-center gap-2 rounded-ds-md border border-dashed border-ds-border-subtle bg-ds-surface px-2 py-2 text-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                <Upload size={14} aria-hidden="true" />
                {slide.backgroundImage ? "Replace image" : "Upload image"}
              </button>
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  handleBgImageFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <input
                type="text"
                value={slide.backgroundImage ?? ""}
                onChange={(event) =>
                  handleBackgroundImageChange(
                    event.target.value.trim() === ""
                      ? undefined
                      : event.target.value.trim(),
                  )
                }
                placeholder="https://… or data:image/…"
                className={`mt-1.5 ${FIELD_CLASS} ${FOCUS_RING}`}
                aria-label="Background image URL"
              />
              {bgImageError ? (
                <p role="alert" className="mt-1 text-xs text-ds-danger-text">
                  {bgImageError}
                </p>
              ) : null}
            </div>
            <p className="text-xs text-ds-text-muted">
              Overrides apply to this slide only. Image &gt; gradient &gt; solid
              color. “Theme” clears the color override.
            </p>
          </div>
        ) : null}

        {inspectorMode === "properties" && activePanel === "source" ? (
          <div
            role="tabpanel"
            id="inspector-panel-source"
            aria-labelledby="inspector-tab-source"
            className="flex flex-col gap-4"
          >
            <SourceSummary
              element={selectedElement}
              staleReason={
                selectedElement
                  ? sourceStaleReasonById?.get(selectedElement.id)
                  : undefined
              }
              onUpdateFromSource={onUpdateElementFromSource}
              onUnlink={onUnlinkElementSource}
              onRelink={onRelinkElementSource}
            />
          </div>
        ) : null}

        {inspectorMode === "properties" && activePanel === "notes" ? (
          <div
            role="tabpanel"
            id="inspector-panel-notes"
            aria-label="Speaker notes"
            className="flex flex-col gap-4"
          >
            <SpeakerNotesControl notes={slide.notes} onChange={onUpdateNotes} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Per-element source-document link panel (#580, #644). Surfaces the current
 * provenance state — standalone, linked, stale, source-missing, or unlinked —
 * and offers command-backed actions: update from source (when content drifted),
 * unlink (detach a live link), and relink (re-establish a previously unlinked
 * ref). Orphaned links whose source block is gone offer unlink rather than a
 * dead "update" action.
 */
