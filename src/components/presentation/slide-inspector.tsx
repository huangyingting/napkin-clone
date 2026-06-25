"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

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

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Bold,
  BringToFront,
  Copy,
  Expand,
  Italic,
  Link2Off,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Plus,
  SendToBack,
  StepBack,
  StepForward,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/ui/tokens";
import { DECK_THEMES } from "@/components/presentation/slide-canvas";
import { LayerList } from "@/components/presentation/layer-list";
import { Swatch, Tooltip } from "@/components/ui";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type {
  BulletItem,
  BulletsElement,
  ConnectorArrow,
  ConnectorElement,
  ConnectorEndpoint,
  Deck,
  ImageCrop,
  ImageElement,
  ImageFitMode,
  ImageMaskShape,
  PlaceholderElement,
  SlideLayout as ReusableSlideLayout,
  ShapeKind,
  Slide,
  SlideElement,
  TextElementStyle,
  TextFitMode,
  TextRun,
} from "@/lib/presentation/deck";
import {
  defaultLayouts,
  normalizeBulletItems,
  PLACEHOLDER_TYPE_LABELS,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import {
  resolveRoleToken,
  type DeckTextRole,
} from "@/lib/presentation/deck-theme-tokens";
import { resolveSlideTokenSet } from "@/lib/presentation/style-cascade";
import type { StaleReason } from "@/lib/presentation/source-link-staleness";
import {
  resolveSourcePanelActions,
  resolveSourcePanelStatus,
} from "@/lib/presentation/source-panel-status";
import type { RightPanelTab } from "@/lib/presentation/slide-panel-ui";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import { detachConnectorEndpoint } from "@/lib/presentation/connector-lifecycle";
import {
  canAddImage,
  dataUrlByteSize,
  isEmptyImageSrc,
} from "@/lib/presentation/image-element";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import { uploadSlideAsset } from "@/app/app/documents/[id]/slide-asset-actions";
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
  bulletsToRuns,
  mergeRuns,
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
  splitRunsIntoLines,
} from "@/lib/presentation/rich-text-html";
import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  mergeSwatches,
  stepFontSize,
  themeSwatchColors,
} from "@/lib/presentation/text-style";
import {
  getThemeTypography,
  placeholderStyle,
} from "@/lib/presentation/theme-typography";
import { DEFAULT_SLIDE_FORMAT } from "@/lib/presentation/slide-format";
import type { Visual } from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { applyTheme, isThemeActive } from "@/lib/visual/transforms";

const SHAPE_OPTIONS: ShapeKind[] = ["rect", "ellipse", "line", "triangle"];

/** Selectable font-family stacks for text/bullets elements. */
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, Cambria, serif" },
  {
    label: "Mono",
    value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

const THEME_BACKGROUND_SWATCHES = themeSwatchColors(DECK_THEMES, "bgColor");
const THEME_ACCENT_SWATCHES = themeSwatchColors(DECK_THEMES, "accentColor");

type Panel = RightPanelTab;
type PositionPanelTab = "arrange" | "layers";

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

let _speakerNotesEditSeq = 0;

const DEFAULT_SHAPE_TEXT_STYLE: TextElementStyle = {
  fontSize: 4,
  bold: false,
  italic: false,
  align: "center",
};

export type AddElementKind = "text" | "bullets" | "image" | "shape";

export interface SlideInspectorProps {
  slide: Slide;
  slideIndex: number;
  /**
   * The whole deck — used only to enforce the total inlined-image budget on the
   * upload path (issue #247). The inspector never mutates it.
   */
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  canDelete: boolean;
  onDuplicateSlide: () => void;
  onRemoveSlide: () => void;
  onApplyLayout: (layout: ReusableSlideLayout) => void;
  onResetLayout: (layout: ReusableSlideLayout) => void;
  onUpdateNotes: (value: string, coalesceKey?: string) => void;
  // Element editing
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onRemoveElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  // Multi-select operations (visible when 2+ elements selected, issue #328)
  selectedElementIds?: ReadonlySet<string>;
  onAlign?: (ids: string[], mode: AlignMode) => void;
  onDistribute?: (ids: string[], mode: DistributeMode) => void;
  onMatchSize?: (ids: string[], mode: MatchSizeMode) => void;
  onArrange?: (ids: string[], mode: ArrangeMode) => void;
  // Group operations (issue #330)
  onGroupElements?: (ids: string[]) => void;
  onUngroupElements?: (groupId: string) => void;
  // Layer list operations (issue #331) — all optional so existing callers compile unchanged
  onSetElementHidden?: (elementId: string, hidden: boolean) => void;
  onSetElementLocked?: (elementId: string, locked: boolean) => void;
  onMoveElementZOrder?: (elementId: string, direction: "up" | "down") => void;
  onRenameElement?: (elementId: string, name: string) => void;
  onReorderElement?: (elementId: string, targetElementId: string) => void;
  // Per-element source-link panel actions (#644) — optional so existing
  // callers compile unchanged. `sourceStaleReasonById` maps an element id to
  // its stale reason when the linked source block has changed or gone missing.
  sourceStaleReasonById?: ReadonlyMap<string, StaleReason>;
  onUpdateElementFromSource?: (elementId: string) => void;
  onUnlinkElementSource?: (elementId: string) => void;
  onRelinkElementSource?: (elementId: string) => void;
  // Style
  onBackgroundChange: (color: string | undefined) => void;
  onBackgroundGradientChange: (
    gradient: { from: string; to: string; angle?: number } | undefined,
  ) => void;
  onBackgroundImageChange: (image: string | undefined) => void;
  onBackgroundAssetChange?: (
    opts: { url: string; assetId: string } | undefined,
  ) => void;
  onAccentChange: (color: string | undefined) => void;
  /**
   * The current user's brand-kit colors, surfaced ahead of the on-theme
   * swatches in the background/accent/text pickers. Optional and best-effort.
   */
  brandSwatches?: readonly string[];
  /**
   * Overrides the root container classes so the host can place the inspector in
   * the desktop right panel or a mobile bottom sheet (issue #209). Defaults to
   * the docked right-panel column.
   */
  className?: string;
  /**
   * When false (Simple mode) advanced inspector sections are hidden: Arrange,
   * Opacity, Effects, corner radius, and gradient. Defaults to true so
   * call-sites that omit the prop preserve today's full behaviour.
   */
  showAdvanced?: boolean;
  /**
   * ID of the owning document. When provided the image upload path attempts a
   * server-side asset upload (Epic #374) before falling back to a data URL.
   */
  documentId?: string;
  /**
   * When provided, the panel is dismissable: a close button is shown in the
   * header so the supplemental panel only stays open while needed (Slides-UI.md).
   */
  onClose?: () => void;
  /** Initial active tab when the panel opens (toolbar handoff). */
  initialTab?: RightPanelTab;
}

function TabButton({
  active,
  tabId,
  panelId,
  label,
  onClick,
  onKeyDown,
}: {
  active: boolean;
  tabId: string;
  panelId: string;
  label: string;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex-1 rounded-ds-sm px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-ds-accent-surface text-ds-accent-text"
          : "text-ds-text-secondary hover:bg-ds-state-hover"
      } ${FOCUS_RING}`}
    >
      {label}
    </button>
  );
}

export function SpeakerNotesControl({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (value: string, coalesceKey?: string) => void;
}) {
  const coalesceKeyRef = useRef<string | null>(null);

  return (
    <label className="block">
      <span className={LABEL_CLASS}>Speaker notes</span>
      <textarea
        value={notes}
        onChange={(event) =>
          onChange(event.target.value, coalesceKeyRef.current ?? undefined)
        }
        onFocus={() => {
          _speakerNotesEditSeq += 1;
          coalesceKeyRef.current = `notes-edit:${_speakerNotesEditSeq}`;
        }}
        onBlur={() => {
          coalesceKeyRef.current = null;
        }}
        rows={12}
        aria-label="Speaker notes"
        placeholder="Add speaker notes…"
        className={`${FIELD_CLASS} min-h-64 resize-y leading-6 placeholder:text-ds-text-muted ${FOCUS_RING}`}
      />
    </label>
  );
}

function elementLabel(element: SlideElement): string {
  switch (element.kind) {
    case "placeholder":
      return `Placeholder · ${placeholderDisplayName(element)}`;
    case "text":
      return element.role === "title" ? "Title" : "Text";
    case "bullets":
      return "Bullets";
    case "visual":
      return "Visual";
    case "image":
      return "Image";
    case "shape":
      return `Shape · ${element.shape}`;
    case "connector":
      return "Connector";
    default:
      return "Element";
  }
}

function shouldShowSourceTab(element: SlideElement | null): boolean {
  return element?.sourceRef !== undefined;
}

function placeholderDisplayName(
  element: Pick<PlaceholderElement, "placeholderType" | "label">,
): string {
  return (
    element.label?.trim() || PLACEHOLDER_TYPE_LABELS[element.placeholderType]
  );
}

function primaryFontLabel(fontFamily: string): string {
  const [first] = fontFamily.split(",");
  return first?.trim().replace(/^['"]|['"]$/g, "") || fontFamily;
}

function placeholderThemeHint(
  deck: Pick<Deck, "theme" | "themeId">,
  element: Pick<PlaceholderElement, "placeholderType">,
): string {
  const style = placeholderStyle(
    element.placeholderType,
    getThemeTypography(deck.themeId ?? deck.theme),
  );
  const parts: string[] = [];
  if (style.fontFamily) {
    parts.push(primaryFontLabel(style.fontFamily));
  }
  if (style.fontSize !== undefined) {
    parts.push(`${style.fontSize} pt`);
  }
  return parts.join(" · ");
}

/**
 * Module-level counter so every `RichTextBox` focus session gets a globally
 * unique coalesce key. Incrementing once per session (not per keystroke) means
 * the entire typed run collapses to one undo step, and each new focus session
 * starts a fresh entry (issue #306).
 */
const _richTextEditSeq = 0;

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
  onClose,
  initialTab,
}: SlideInspectorProps) {
  const [positionTab, setPositionTab] = useState<PositionPanelTab>("arrange");
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  const elements = slide.elements ?? [];
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  const canShowTextPanel =
    selectedElement?.kind === "text" ||
    selectedElement?.kind === "bullets" ||
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

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const tabs: PositionPanelTab[] = ["arrange", "layers"];
    const idx = tabs.indexOf(positionTab);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setPositionTab(tabs[(idx + 1) % tabs.length]);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setPositionTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
    } else if (event.key === "Home") {
      event.preventDefault();
      setPositionTab(tabs[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      setPositionTab(tabs[tabs.length - 1]);
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
    uploadFn: documentId ? uploadSlideAsset : undefined,
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

  const themeConfig = DECK_THEMES[slide.theme] ?? DECK_THEMES.default;
  const panelTitle: Record<Panel, string> = {
    position: "Position",
    text: "Text",
    effects: "Effects",
    media: "Media",
    slide: "Slide",
    notes: "Notes",
    source: "Source",
  };

  return (
    <aside className={className}>
      <div className="flex items-center justify-between border-b border-ds-border-subtle px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ds-text-muted">
            Slide {slideIndex + 1}
          </p>
          <h3 className="text-sm font-semibold text-ds-text-primary">
            {panelTitle[panel]}
          </h3>
        </div>
        <div className="flex items-center gap-1">
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

      {panel === "position" ? (
        <div
          role="tablist"
          aria-label="Position panel tabs"
          className="flex items-center gap-1 border-b border-ds-border-subtle px-3 py-2"
        >
          <TabButton
            active={positionTab === "arrange"}
            tabId="inspector-tab-arrange"
            panelId="inspector-panel-arrange"
            label="Arrange"
            onClick={() => setPositionTab("arrange")}
            onKeyDown={handleTabKeyDown}
          />
          <TabButton
            active={positionTab === "layers"}
            tabId="inspector-tab-layers"
            panelId="inspector-panel-layers"
            label="Layers"
            onClick={() => setPositionTab("layers")}
            onKeyDown={handleTabKeyDown}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 px-4 py-4">
        {panel === "position" && positionTab === "arrange" ? (
          <div
            role="tabpanel"
            id="inspector-panel-arrange"
            aria-labelledby="inspector-tab-arrange"
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
            ) : (
              <p className="text-xs text-ds-text-muted">
                Select an element to arrange it.
              </p>
            )}
          </div>
        ) : null}

        {panel === "position" && positionTab === "layers" ? (
          <div
            role="tabpanel"
            id="inspector-panel-layers"
            aria-labelledby="inspector-tab-layers"
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

        {panel === "text" ? (
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

        {panel === "effects" ? (
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

        {panel === "media" ? (
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

        {panel === "slide" ? (
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
              fallback={themeConfig.bgColor}
              presets={mergeSwatches(brandSwatches, THEME_BACKGROUND_SWATCHES)}
              onChange={onBackgroundChange}
            />
            <ColorOverride
              label="Accent"
              value={slide.accent}
              fallback={themeConfig.accentColor}
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

        {panel === "source" ? (
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

        {panel === "notes" ? (
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
