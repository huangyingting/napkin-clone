"use client";

/**
 * Right-side task-panel router for the slide editor.
 *
 * The inspector renders exactly one active panel at a time
 * (slide-editor-panel-taxonomy.md). Each panel owns one broad property
 * category — Slide, Arrange, Text, Appearance, Effects, Source, Notes, or
 * Layers — and the available set is computed from the current selection by
 * {@link availablePanels}. A compact in-panel switcher moves between the
 * available panels; it mirrors the toolbar `...` menu and never offers a panel
 * that cannot render.
 *
 * Purely presentational: every change is reported through callbacks; the
 * component never mutates the deck.
 */

import { Check, ChevronDown, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/ui/tokens";
import {
  PropRow,
  FIELD_CLASS,
  PANEL_BODY_CLASS,
  PanelSection,
  SelectField,
  SpeakerNotesControl,
} from "@/components/presentation/slide-inspector/primitives";
import { LayerList } from "@/components/presentation/layer-list";
import { Popover, Tooltip } from "@/components/ui";
import type { Deck, Slide, SlideElement } from "@/lib/presentation/deck";
import { defaultLayouts } from "@/lib/presentation/deck";
import { assertNever } from "@/lib/assert-never";
import {
  availablePanels,
  defaultPanelTab,
  isPanelAvailable,
  PANEL_LABELS,
  toToolbarSelectionKind,
  type RightPanelTab,
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
import {
  resolveSlideThemeColors,
  type SlideThemeColors,
} from "@/lib/presentation/style-cascade";
import { DEFAULT_SLIDE_FORMAT } from "@/lib/presentation/slide-format";
import {
  scaleElementsInBoundingBox,
  selectionBoundingBox,
} from "@/lib/presentation/selection-transform";

const BUILT_IN_THEME_TOKEN_SETS = allThemeTokenSets();
const THEME_BACKGROUND_SWATCHES = tokenSetSwatchColors(
  BUILT_IN_THEME_TOKEN_SETS,
  "slideBg",
);
const THEME_ACCENT_SWATCHES = tokenSetSwatchColors(
  BUILT_IN_THEME_TOKEN_SETS,
  "accent",
);

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

/**
 * Compact dropdown that switches between the available task panels. Hidden when
 * there is zero or one choice, matching the toolbar `...` menu rules
 * (slide-editor-panel-taxonomy.md).
 */
function PanelSwitcher({
  panels,
  activeTab,
  onSelectTab,
}: {
  panels: readonly RightPanelTab[];
  activeTab: RightPanelTab;
  onSelectTab: (tab: RightPanelTab) => void;
}) {
  const [open, setOpen] = useState(false);
  if (panels.length <= 1) return null;
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
          {PANEL_LABELS[activeTab]}
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      }
    >
      <div className="flex flex-col">
        {panels.map((panel) => {
          const active = panel === activeTab;
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
              {PANEL_LABELS[panel]}
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
 * not a visual effect and lives in Layers (slide-editor-panel-taxonomy.md).
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

/**
 * Slide-level design surface: reusable layout, per-slide background, accent,
 * gradient, and background image. Layout and background stay in one panel for
 * now (decision #12).
 */
function SlidePanelBody({
  slide,
  deck,
  themeColors,
  brandSwatches,
  showAdvanced,
  documentId,
  slideAssetPort,
  onApplyLayout,
  onResetLayout,
  onBackgroundChange,
  onBackgroundGradientChange,
  onBackgroundImageChange,
  onBackgroundAssetChange,
  onAccentChange,
}: {
  slide: Slide;
  deck: Deck;
  themeColors: SlideThemeColors;
  brandSwatches: readonly string[];
  showAdvanced: boolean;
  documentId?: string;
  slideAssetPort?: SlideInspectorProps["slideAssetPort"];
  onApplyLayout: SlideInspectorProps["onApplyLayout"];
  onResetLayout: SlideInspectorProps["onResetLayout"];
  onBackgroundChange: SlideInspectorProps["onBackgroundChange"];
  onBackgroundGradientChange: SlideInspectorProps["onBackgroundGradientChange"];
  onBackgroundImageChange: SlideInspectorProps["onBackgroundImageChange"];
  onBackgroundAssetChange?: SlideInspectorProps["onBackgroundAssetChange"];
  onAccentChange: SlideInspectorProps["onAccentChange"];
}) {
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  const [bgImageError, setBgImageError] = useState<string | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

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

  function handleBackgroundImageChange(value: string | undefined) {
    if (value?.startsWith("data:")) {
      if (!value.startsWith("data:image/")) {
        setBgImageError("Please enter an image data URL (data:image/…).");
        return;
      }
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

  return (
    <>
      {selectedLayout ? (
        <PanelSection title="Layout">
          <PropRow label="Preset">
            <SelectField
              value={selectedLayout.id}
              onChange={setSelectedLayoutId}
              ariaLabel="Reusable layout"
              options={availableLayouts.map((layout) => ({
                value: layout.id,
                label: layout.name,
              }))}
            />
          </PropRow>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onApplyLayout(selectedLayout)}
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => onResetLayout(selectedLayout)}
              className={`rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-1.5 text-[13px] font-medium text-ds-danger-text hover:opacity-90 ${FOCUS_RING}`}
            >
              Reset
            </button>
          </div>
        </PanelSection>
      ) : null}
      <PanelSection title="Background">
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
          <>
            <PropRow label="Gradient">
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
                className="h-4 w-4 accent-ds-accent"
                aria-label="Enable gradient background"
              />
            </PropRow>
            {slide.backgroundGradient ? (
              <PropRow label="Stops" align="center">
                <input
                  type="color"
                  value={slide.backgroundGradient.from}
                  onChange={(event) =>
                    onBackgroundGradientChange({
                      ...slide.backgroundGradient!,
                      from: event.target.value,
                    })
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
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
                  className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
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
                  className="min-w-0 flex-1 accent-ds-accent"
                  aria-label="Gradient angle"
                />
              </PropRow>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => bgFileInputRef.current?.click()}
            className={`flex w-full items-center justify-center gap-2 rounded-ds-md border border-dashed border-ds-border-subtle bg-ds-surface px-2 py-2 text-[13px] text-ds-text-secondary transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
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
            className={`${FIELD_CLASS} ${FOCUS_RING}`}
            aria-label="Background image URL"
          />
          {bgImageError ? (
            <p role="alert" className="text-xs text-ds-danger-text">
              {bgImageError}
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-ds-text-muted">
            Overrides apply to this slide only. Image &gt; gradient &gt; solid
            color. “Theme” clears the color override.
          </p>
        </div>
      </PanelSection>
    </>
  );
}

export function SlideInspector({
  slide,
  deck,
  visuals,
  selectedElementId,
  selectedElementIds,
  onSelectElement,
  onApplyLayout,
  onResetLayout,
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
        selectedElement.kind === "shape" ? selectedElement.shape : undefined,
      )
    : null;
  const availability = {
    kind: selectedCount >= 2 ? null : selectionKind,
    selectedCount,
    hasSourceRef: selectedElement?.sourceRef !== undefined,
  };
  const panels = availablePanels(availability);

  const requestedTab = initialTab ?? defaultPanelTab(selectedCount > 0);
  // No fallback routing: when the requested panel is unavailable the shell
  // closes the right panel. Render nothing until that effect runs.
  const activeTab = isPanelAvailable(requestedTab, availability)
    ? requestedTab
    : null;

  const themeColors = resolveSlideThemeColors(deck, slide);
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

      <div className={PANEL_BODY_CLASS}>
        {activeTab === "slide" ? (
          <SlidePanelBody
            slide={slide}
            deck={deck}
            themeColors={themeColors}
            brandSwatches={brandSwatches}
            showAdvanced={showAdvanced}
            documentId={documentId}
            slideAssetPort={slideAssetPort}
            onApplyLayout={onApplyLayout}
            onResetLayout={onResetLayout}
            onBackgroundChange={onBackgroundChange}
            onBackgroundGradientChange={onBackgroundGradientChange}
            onBackgroundImageChange={onBackgroundImageChange}
            onBackgroundAssetChange={onBackgroundAssetChange}
            onAccentChange={onAccentChange}
          />
        ) : null}

        {activeTab === "notes" ? (
          <PanelSection title="Speaker notes">
            <SpeakerNotesControl notes={slide.notes} onChange={onUpdateNotes} />
          </PanelSection>
        ) : null}

        {activeTab === "layers" ? (
          <div className="p-2">
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

        {activeTab === "appearance" && selectedElement ? (
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

        {activeTab === "source" && selectedElement ? (
          <SourceSummary
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
