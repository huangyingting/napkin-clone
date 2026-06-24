"use client";

/**
 * Tabbed inspector for the slide editor.
 *
 * Two tabs:
 *  - **Content** — edits the selected free-form element (text, bullets, image,
 *    shape, visual), lists all elements with reorder/delete, and adds new ones.
 *  - **Style** — per-slide background and accent color overrides.
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
  MoveHorizontal,
  MoveVertical,
  SendToBack,
  StepBack,
  StepForward,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
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
  bulletsToRuns,
  mergeRuns,
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
  splitRunsIntoLines,
} from "@/lib/presentation/rich-text-html";
import {
  mergeSwatches,
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
   * the desktop side pane or a mobile bottom sheet (issue #209). Defaults to the
   * desktop three-pane column.
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

function SpeakerNotesControl({
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
let _richTextEditSeq = 0;

function RichTextBox({
  label,
  html,
  onChange,
}: {
  label: string;
  html: string;
  onChange: (
    value: { text: string; runs: TextRun[] },
    coalesceKey?: string,
  ) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef("");
  // Coalesce key for the active editing session — the whole run of keystrokes
  // collapses to one undo step (issue #306). Set on focus, cleared on blur.
  const coalesceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (lastHtmlRef.current === html) return;
    if (document.activeElement === node) return;
    node.innerHTML = html;
    lastHtmlRef.current = html;
  }, [html]);

  const emitChange = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const serialized = serializeRichText(node);
    lastHtmlRef.current = node.innerHTML;
    onChange(serialized, coalesceKeyRef.current ?? undefined);
  }, [onChange]);

  const applyCommand = useCallback(
    (command: "bold" | "italic" | "foreColor", value?: string) => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      document.execCommand(command, false, value);
      emitChange();
    },
    [emitChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL_CLASS}>{label}</span>
      <div className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-1 py-1">
        <button
          type="button"
          aria-label="Bold selected text"
          onClick={() => applyCommand("bold")}
          className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <Bold size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Italic selected text"
          onClick={() => applyCommand("italic")}
          className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <Italic size={14} aria-hidden="true" />
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs text-ds-text-muted">
          Color
          <input
            type="color"
            aria-label="Selected text color"
            className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
            onChange={(event) => applyCommand("foreColor", event.target.value)}
          />
        </label>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onFocus={() => {
          _richTextEditSeq += 1;
          coalesceKeyRef.current = `rich-text-edit:${_richTextEditSeq}`;
        }}
        onBlur={() => {
          emitChange();
          coalesceKeyRef.current = null;
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className={`min-h-24 w-full whitespace-pre-wrap rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </div>
  );
}

/**
 * Content editor for an {@link ImageElement}. Offers three ways to set a source,
 * all routed through `onUpdateElement` (the undoable + autosaving commit path):
 *
 *  - **Upload** — a file picker reads the chosen image to a base64 data URL via
 *    {@link FileReader}. Files are validated for type and size first so a stray
 *    non-image or an oversized file never bloats `deckJson` (#226), and the new
 *    image is rejected if it would push the deck past the total inlined-image
 *    budget so autosave stays cheap (#247).
 *  - **URL / data URL** — the existing text field still accepts a pasted source.
 *  - **Alt text** — accessible description, unchanged.
 *  - **Fit / mask / crop** — non-destructive presentation controls stored on the
 *    element so the canvas, present mode, and export paths can honor them.
 */
function ImageElementEditor({
  element,
  deck,
  showAdvanced,
  onUpdateElement,
  documentId,
}: {
  element: ImageElement;
  deck: Deck;
  showAdvanced: boolean;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
  documentId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { handleFile } = useImageUpload({
    deck,
    currentSrc: element.src,
    onAccept: (src, assetId) => {
      setError(null);
      onUpdateElement(element.id, { src, ...(assetId ? { assetId } : {}) });
    },
    onError: (message) => setError(message),
    documentId,
    uploadFn: documentId ? uploadSlideAsset : undefined,
  });

  const hasSource = !isEmptyImageSrc(element.src);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className={LABEL_CLASS}>Image</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex w-full items-center justify-center gap-2 rounded-ds-md border border-dashed border-ds-border-subtle bg-ds-surface px-2 py-2 text-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
        >
          <Upload size={14} aria-hidden="true" />
          {hasSource ? "Replace image" : "Upload image"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            // Reset so re-selecting the same file fires onChange again.
            event.target.value = "";
          }}
        />
        {error ? (
          <p role="alert" className="mt-1 text-xs text-ds-danger-text">
            {error}
          </p>
        ) : null}
      </div>
      <label className="block">
        <span className={LABEL_CLASS}>Image URL</span>
        <input
          type="text"
          value={element.src}
          onChange={(event) =>
            onUpdateElement(element.id, { src: event.target.value })
          }
          placeholder="https://… or data:image/…"
          className={`${FIELD_CLASS} ${FOCUS_RING}`}
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Alt text</span>
        <input
          type="text"
          value={element.alt ?? ""}
          onChange={(event) =>
            onUpdateElement(element.id, { alt: event.target.value })
          }
          className={`${FIELD_CLASS} ${FOCUS_RING}`}
        />
      </label>
      <ImageFitModeControl
        fitMode={element.fitMode}
        onChange={(fitMode) => onUpdateElement(element.id, { fitMode })}
      />
      <ImageMaskControl
        maskShape={element.maskShape}
        onChange={(maskShape) => onUpdateElement(element.id, { maskShape })}
      />
      <ImageCropControl
        crop={element.crop}
        onChange={(crop) => onUpdateElement(element.id, { crop })}
      />
      {showAdvanced ? (
        <label className="block">
          <span className={LABEL_CLASS}>Corner radius</span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={element.radius ?? 0}
            onChange={(event) => {
              const radius = Number(event.target.value);
              onUpdateElement(element.id, {
                radius: radius <= 0 ? undefined : radius,
              });
            }}
            className="w-full accent-ds-accent"
            aria-label="Image corner radius"
          />
        </label>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image controls
// ---------------------------------------------------------------------------

const IMAGE_FIT_MODE_OPTIONS: {
  value: ImageFitMode;
  label: string;
  title: string;
}[] = [
  {
    value: "contain",
    label: "Contain",
    title: "Show the full image inside the box",
  },
  {
    value: "cover",
    label: "Cover",
    title: "Fill the box and crop overflow",
  },
  {
    value: "fill",
    label: "Stretch",
    title: "Stretch the image to fill the box",
  },
  {
    value: "none",
    label: "None",
    title: "Keep the image at its intrinsic size and clip overflow",
  },
];

const IMAGE_MASK_OPTIONS: { value: ImageMaskShape; label: string }[] = [
  { value: "none", label: "None" },
  { value: "circle", label: "Circle" },
  { value: "rounded", label: "Rounded" },
  { value: "diamond", label: "Diamond" },
];

function ImageFitModeControl({
  fitMode,
  onChange,
}: {
  fitMode: ImageFitMode | undefined;
  onChange: (fitMode: ImageFitMode | undefined) => void;
}) {
  const active = fitMode ?? "contain";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Fit</span>
      <div
        role="radiogroup"
        aria-label="Image fit mode"
        className="flex flex-wrap justify-end gap-0.5"
      >
        {IMAGE_FIT_MODE_OPTIONS.map(({ value, label, title }) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={title}
              onClick={() => onChange(value === "contain" ? undefined : value)}
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImageMaskControl({
  maskShape,
  onChange,
}: {
  maskShape: ImageMaskShape | undefined;
  onChange: (maskShape: ImageMaskShape | undefined) => void;
}) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>Mask</span>
      <select
        value={maskShape ?? "none"}
        onChange={(event) => {
          const value = event.target.value as ImageMaskShape;
          onChange(value === "none" ? undefined : value);
        }}
        className={`${FIELD_CLASS} ${FOCUS_RING}`}
      >
        {IMAGE_MASK_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageCropControl({
  crop,
  onChange,
}: {
  crop: ImageCrop | undefined;
  onChange: (crop: ImageCrop | undefined) => void;
}) {
  const current: ImageCrop = crop ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  function commit(side: keyof ImageCrop, value: number) {
    const next = {
      ...current,
      [side]: Math.max(0, Math.min(100, value)) / 100,
    };
    onChange(
      Object.values(next).every((entry) => entry <= 0) ? undefined : next,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-crop-dialog-label"
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span id="image-crop-dialog-label" className={LABEL_CLASS + " mb-0"}>
          Crop
        </span>
        {/* Visible instruction pill — decorative; screen-reader text below */}
        <span
          aria-hidden="true"
          className="rounded-full border border-ds-border-subtle px-2 py-0.5 text-xs text-ds-text-secondary"
        >
          Enter % per side
        </span>
      </div>
      <span className="sr-only">
        Enter percentage values from 0 to 100 to crop each side of the image.
        Top, Right, Bottom, and Left fields trim that fraction of the image.
      </span>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Top %"
          value={current.top * 100}
          onCommit={(value) => commit("top", value)}
        />
        <NumberField
          label="Right %"
          value={current.right * 100}
          onCommit={(value) => commit("right", value)}
        />
        <NumberField
          label="Bottom %"
          value={current.bottom * 100}
          onCommit={(value) => commit("bottom", value)}
        />
        <NumberField
          label="Left %"
          value={current.left * 100}
          onCommit={(value) => commit("left", value)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fit mode picker (text / bullets elements)
// ---------------------------------------------------------------------------

const FIT_MODE_OPTIONS: { value: TextFitMode; label: string; title: string }[] =
  [
    {
      value: "auto-height",
      label: "Auto",
      title: "Box grows to fit content (default)",
    },
    {
      value: "fixed-box",
      label: "Clip",
      title: "Box height is fixed; overflow is clipped",
    },
    {
      value: "shrink-to-fit",
      label: "Shrink",
      title: "Font shrinks until content fits the box",
    },
  ];

function FitModeControl({
  fitMode,
  onChange,
}: {
  fitMode: TextFitMode | undefined;
  onChange: (mode: TextFitMode | undefined) => void;
}) {
  const active = fitMode ?? "auto-height";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Text fit</span>
      <div
        role="radiogroup"
        aria-label="Text fit mode"
        className="flex gap-0.5"
      >
        {FIT_MODE_OPTIONS.map(({ value, label, title }) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={title}
              onClick={() =>
                // Selecting the default "auto-height" clears the field
                onChange(value === "auto-height" ? undefined : value)
              }
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical align control
// ---------------------------------------------------------------------------

type VerticalAlignValue = "top" | "middle" | "bottom";

const VERTICAL_ALIGN_OPTIONS: {
  value: VerticalAlignValue;
  label: string;
  title: string;
}[] = [
  { value: "top", label: "Top", title: "Align text to top" },
  { value: "middle", label: "Mid", title: "Center text vertically (default)" },
  { value: "bottom", label: "Bot", title: "Align text to bottom" },
];

function VerticalAlignControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const active: VerticalAlignValue = style.verticalAlign ?? "middle";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>V-align</span>
      <div
        role="radiogroup"
        aria-label="Vertical text alignment"
        className="flex gap-0.5"
      >
        {VERTICAL_ALIGN_OPTIONS.map(({ value, label, title }) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={title}
              onClick={() =>
                onChange({
                  ...style,
                  // "middle" is the default — clear the field to keep the model lean
                  ...(value === "middle"
                    ? { verticalAlign: undefined }
                    : { verticalAlign: value }),
                })
              }
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line height control
// ---------------------------------------------------------------------------

const LINE_HEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 1.0, label: "1.0" },
  { value: 1.2, label: "1.2" },
  { value: 1.5, label: "1.5" },
  { value: 2.0, label: "2.0" },
];

function LineHeightControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const active = style.lineHeight ?? 1.2;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Line height</span>
      <div role="radiogroup" aria-label="Line height" className="flex gap-0.5">
        {LINE_HEIGHT_OPTIONS.map(({ value, label }) => {
          const isActive = Math.abs(active - value) < 0.001;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={`Line height ${label}`}
              onClick={() =>
                onChange({
                  ...style,
                  // 1.2 is the default — clear to keep model lean
                  ...(Math.abs(value - 1.2) < 0.001
                    ? { lineHeight: undefined }
                    : { lineHeight: value }),
                })
              }
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paragraph spacing control (text elements)
// ---------------------------------------------------------------------------

function ParagraphSpacingControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Para spacing</span>
      <input
        type="number"
        min={0}
        max={20}
        step={0.5}
        value={style.paragraphSpacing ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          const next = { ...style };
          if (!Number.isFinite(v) || v <= 0) {
            delete next.paragraphSpacing;
          } else {
            next.paragraphSpacing = v;
          }
          onChange(next);
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Bullets-specific: bulletGap and bulletIndent
// ---------------------------------------------------------------------------

function BulletGapControl({
  element,
  onChange,
}: {
  element: BulletsElement;
  onChange: (patch: Partial<BulletsElement>) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Bullet gap</span>
      <input
        type="number"
        min={0}
        max={20}
        step={0.5}
        value={element.bulletGap ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v) || v <= 0) {
            onChange({ bulletGap: undefined });
          } else {
            onChange({ bulletGap: v });
          }
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

function BulletIndentControl({
  element,
  onChange,
}: {
  element: BulletsElement;
  onChange: (patch: Partial<BulletsElement>) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Bullet indent</span>
      <input
        type="number"
        min={0}
        max={30}
        step={1}
        value={element.bulletIndent ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v) || v <= 0) {
            onChange({ bulletIndent: undefined });
          } else {
            onChange({ bulletIndent: v });
          }
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

/**
 * List-type toggle: switches all items in the list between bullet and numbered.
 * Per-item list type is set via Tab/Shift+Tab in the inline editor.
 */
function ListTypeControl({
  element,
  onChange,
}: {
  element: BulletsElement;
  onChange: (patch: Partial<BulletsElement>) => void;
}) {
  const items = normalizeBulletItems(element);
  // Consider the list "numbered" if a majority of items are numbered.
  const numberedCount = items.filter(
    (it: BulletItem) => it.listType === "number",
  ).length;
  const isNumbered = items.length > 0 && numberedCount > items.length / 2;

  function toggle() {
    const targetType = isNumbered ? "bullet" : "number";
    const newItems: BulletItem[] = items.map((it: BulletItem) => ({
      ...it,
      listType: targetType,
    }));
    onChange({ items: newItems });
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>List type</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => !isNumbered || toggle()}
          className={`rounded-ds-md border px-2 py-1 text-xs transition-colors ${
            !isNumbered
              ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
              : "border-ds-border-subtle bg-ds-surface text-ds-text-primary hover:bg-ds-state-hover"
          } ${FOCUS_RING}`}
          aria-pressed={!isNumbered}
          title="Bullet list"
        >
          • Bullet
        </button>
        <button
          type="button"
          onClick={() => isNumbered || toggle()}
          className={`rounded-ds-md border px-2 py-1 text-xs transition-colors ${
            isNumbered
              ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
              : "border-ds-border-subtle bg-ds-surface text-ds-text-primary hover:bg-ds-state-hover"
          } ${FOCUS_RING}`}
          aria-pressed={isNumbered}
          title="Numbered list"
        >
          1. Number
        </button>
      </div>
    </div>
  );
}

function TextPanel({
  element,
  onUpdateElement,
}: {
  element: SlideElement | null;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const [textTab, setTextTab] = useState<"font" | "style">("font");

  if (!element) {
    return (
      <p className="text-xs text-ds-text-muted">
        Select a text-bearing element to edit typography.
      </p>
    );
  }

  if (
    element.kind !== "text" &&
    element.kind !== "bullets" &&
    !(element.kind === "shape" && element.shape !== "line")
  ) {
    return (
      <p className="text-xs text-ds-text-muted">
        Text settings are available for text, bullets, and labeled shapes.
      </p>
    );
  }

  const style =
    element.kind === "shape"
      ? (element.textStyle ?? DEFAULT_SHAPE_TEXT_STYLE)
      : element.style;
  const updateStyle = (next: TextElementStyle) => {
    if (element.kind === "shape") {
      onUpdateElement(element.id, { textStyle: next });
      return;
    }
    onUpdateElement(element.id, { style: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Text settings tabs"
        className="flex items-center gap-1 rounded-ds-md bg-ds-surface-raised p-1"
      >
        <TabButton
          active={textTab === "font"}
          tabId="text-panel-tab-font"
          panelId="text-panel-font"
          label="Font"
          onClick={() => setTextTab("font")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setTextTab((current) => (current === "font" ? "style" : "font"));
            }
          }}
        />
        <TabButton
          active={textTab === "style"}
          tabId="text-panel-tab-style"
          panelId="text-panel-style"
          label="Style"
          onClick={() => setTextTab("style")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setTextTab((current) => (current === "font" ? "style" : "font"));
            }
          }}
        />
      </div>

      {textTab === "font" ? (
        <div
          role="tabpanel"
          id="text-panel-font"
          aria-labelledby="text-panel-tab-font"
          className="flex flex-col gap-3"
        >
          <FontFamilyControl style={style} onChange={updateStyle} />
          <LineHeightControl style={style} onChange={updateStyle} />
          {element.kind === "text" || element.kind === "shape" ? (
            <ParagraphSpacingControl style={style} onChange={updateStyle} />
          ) : null}
          {element.kind === "bullets" ? (
            <BulletGapControl
              element={element}
              onChange={(patch) => onUpdateElement(element.id, patch)}
            />
          ) : null}
        </div>
      ) : null}

      {textTab === "style" ? (
        <div
          role="tabpanel"
          id="text-panel-style"
          aria-labelledby="text-panel-tab-style"
          className="flex flex-col gap-3"
        >
          {element.kind === "text" || element.kind === "bullets" ? (
            <FitModeControl
              fitMode={element.fitMode}
              onChange={(fitMode) => onUpdateElement(element.id, { fitMode })}
            />
          ) : null}
          <VerticalAlignControl style={style} onChange={updateStyle} />
          {element.kind === "bullets" ? (
            <>
              <BulletIndentControl
                element={element}
                onChange={(patch) => onUpdateElement(element.id, patch)}
              />
              <ListTypeControl
                element={element}
                onChange={(patch) => onUpdateElement(element.id, patch)}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EffectsPanel({
  element,
  onUpdateElement,
}: {
  element: SlideElement | null;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  if (!element) {
    return (
      <p className="text-xs text-ds-text-muted">
        Select an element to edit effects.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ElementOpacityControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
      <ElementEffectsControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
    </div>
  );
}

function ElementEditor({
  element,
  deck,
  visuals,
  showAdvanced,
  elements,
  onUpdateElement,
  documentId,
}: {
  element: SlideElement;
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  showAdvanced: boolean;
  elements: readonly SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
  documentId?: string;
}) {
  switch (element.kind) {
    case "placeholder":
      return (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={LABEL_CLASS}>Placeholder type</span>
            <div
              className={`${FIELD_CLASS} cursor-default bg-ds-state-hover text-ds-text-secondary`}
            >
              {PLACEHOLDER_TYPE_LABELS[element.placeholderType]}
            </div>
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Label</span>
            <input
              type="text"
              value={element.label ?? ""}
              onChange={(event) =>
                onUpdateElement(element.id, {
                  label:
                    event.target.value.trim().length > 0
                      ? event.target.value
                      : undefined,
                })
              }
              placeholder={PLACEHOLDER_TYPE_LABELS[element.placeholderType]}
              className={`${FIELD_CLASS} ${FOCUS_RING}`}
            />
          </label>
          <p className="text-xs text-ds-text-muted">
            Theme hint: {placeholderThemeHint(deck, element)}.
          </p>
          <p className="text-xs text-ds-text-muted">
            Shown on-canvas until this slot is replaced with slide content.
          </p>
        </div>
      );
    case "text":
      return (
        <div className="flex flex-col gap-3">
          <RichTextBox
            label="Text"
            html={runsToHtml(element.runs, element.text)}
            onChange={({ text, runs }, coalesceKey) =>
              onUpdateElement(
                element.id,
                {
                  text,
                  runs: shouldStoreRuns(runs) ? runs : undefined,
                },
                coalesceKey,
              )
            }
          />
          <FontFamilyControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <FitModeControl
            fitMode={element.fitMode}
            onChange={(fitMode) => onUpdateElement(element.id, { fitMode })}
          />
          <VerticalAlignControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <LineHeightControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <ParagraphSpacingControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
        </div>
      );
    case "bullets":
      return (
        <div className="flex flex-col gap-3">
          <RichTextBox
            label="Bullets"
            html={runsToHtml(
              bulletsToRuns(element.bullets, element.bulletRuns),
              element.bullets.join("\n"),
            )}
            onChange={({ runs }, coalesceKey) => {
              const lines = splitRunsIntoLines(runs)
                .map((line) => ({
                  text: line.text.replace(/\s+$/, ""),
                  runs: mergeRuns(line.runs),
                }))
                .filter((line) => line.text.length > 0);
              const hasRichBullets = lines.some((line) =>
                shouldStoreRuns(line.runs),
              );
              // Co-update items[] when it is the authoritative source so that
              // normalizeBulletItems doesn't shadow the text edit.  We preserve
              // each item's indent/listType by index; indices beyond the
              // existing length (newly added lines) get no metadata.
              const existingItems = element.items;
              const updatedItems: BulletItem[] | undefined = existingItems
                ? lines.map((line, i) => {
                    const prev = existingItems[i];
                    return {
                      text: line.text,
                      ...(shouldStoreRuns(line.runs)
                        ? { runs: line.runs }
                        : {}),
                      ...(prev?.indent !== undefined
                        ? { indent: prev.indent }
                        : {}),
                      ...(prev?.listType !== undefined
                        ? { listType: prev.listType }
                        : {}),
                    };
                  })
                : undefined;
              onUpdateElement(
                element.id,
                {
                  bullets: lines.map((line) => line.text),
                  bulletRuns: hasRichBullets
                    ? lines.map((line) => line.runs)
                    : undefined,
                  ...(updatedItems !== undefined
                    ? { items: updatedItems }
                    : {}),
                },
                coalesceKey,
              );
            }}
          />
          <FontFamilyControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <FitModeControl
            fitMode={element.fitMode}
            onChange={(fitMode) => onUpdateElement(element.id, { fitMode })}
          />
          <VerticalAlignControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <LineHeightControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <BulletGapControl
            element={element}
            onChange={(patch) => onUpdateElement(element.id, patch)}
          />
          <BulletIndentControl
            element={element}
            onChange={(patch) => onUpdateElement(element.id, patch)}
          />
          <ListTypeControl
            element={element}
            onChange={(patch) => onUpdateElement(element.id, patch)}
          />
        </div>
      );
    case "image":
      return (
        <ImageElementEditor
          element={element}
          deck={deck}
          showAdvanced={showAdvanced}
          onUpdateElement={onUpdateElement}
          documentId={documentId}
        />
      );
    case "shape":
      return (
        <div className="flex flex-col gap-3">
          {element.shape !== "line" ? (
            <RichTextBox
              label="Text"
              html={runsToHtml(element.textRuns, element.text ?? "")}
              onChange={({ text, runs }, coalesceKey) =>
                onUpdateElement(
                  element.id,
                  {
                    text: text.trim().length > 0 ? text : undefined,
                    textRuns:
                      shouldStoreRuns(runs) && text.trim().length > 0
                        ? runs
                        : undefined,
                  },
                  coalesceKey,
                )
              }
            />
          ) : null}
          <label className="block">
            <span className={LABEL_CLASS}>Shape</span>
            <select
              value={element.shape}
              onChange={(event) =>
                onUpdateElement(element.id, {
                  shape: event.target.value as ShapeKind,
                })
              }
              className={`${FIELD_CLASS} ${FOCUS_RING}`}
            >
              {SHAPE_OPTIONS.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
          </label>
          {element.shape !== "triangle" ? (
            <label className="flex items-center justify-between gap-2">
              <span className={LABEL_CLASS + " mb-0"}>
                {element.shape === "line" ? "Thickness" : "Border"}
              </span>
              <span className="flex items-center gap-2">
                {element.shape !== "line" ? (
                  <input
                    type="color"
                    value={element.stroke?.color ?? "#000000"}
                    onChange={(event) =>
                      onUpdateElement(element.id, {
                        stroke: {
                          color: event.target.value,
                          width: element.stroke?.width ?? 0.4,
                        },
                      })
                    }
                    className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
                    aria-label="Border color"
                  />
                ) : null}
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.25}
                  value={
                    element.stroke?.width ??
                    (element.shape === "line" ? 0.4 : 0)
                  }
                  onChange={(event) => {
                    const width = Number(event.target.value);
                    onUpdateElement(element.id, {
                      stroke:
                        width <= 0
                          ? undefined
                          : {
                              color:
                                element.stroke?.color ??
                                (element.shape === "line"
                                  ? element.color
                                  : "#000000"),
                              width,
                            },
                    });
                  }}
                  className="w-24 accent-ds-accent"
                  aria-label={
                    element.shape === "line" ? "Line thickness" : "Border width"
                  }
                />
              </span>
            </label>
          ) : null}
          {element.shape === "rect" && showAdvanced ? (
            <label className="block">
              <span className={LABEL_CLASS}>Corner radius</span>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={element.radius ?? 0}
                onChange={(event) => {
                  const radius = Number(event.target.value);
                  onUpdateElement(element.id, {
                    radius: radius <= 0 ? undefined : radius,
                  });
                }}
                className="w-full accent-ds-accent"
                aria-label="Corner radius"
              />
            </label>
          ) : null}
        </div>
      );
    case "visual":
      return (
        <VisualElementEditor
          element={element}
          visuals={visuals}
          onUpdateElement={onUpdateElement}
        />
      );
    case "connector":
      return (
        <ConnectorElementEditor
          element={element}
          elements={elements}
          onUpdateElement={onUpdateElement}
        />
      );
    default:
      return null;
  }
}

const ARROW_OPTIONS: { value: ConnectorArrow; label: string }[] = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Open arrow" },
  { value: "filled", label: "Filled arrow" },
];

/**
 * Inspector controls for a selected {@link ConnectorElement} (issue #325).
 *
 * Provides:
 *  - Arrowhead style at start/end (none / open arrow / filled arrow)
 *  - Dashed line toggle
 *  - Stroke color + width
 *  - Detach start / end endpoint (converts bound anchor to free point)
 */
function ConnectorElementEditor({
  element,
  elements,
  onUpdateElement,
}: {
  element: ConnectorElement;
  elements: readonly SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const startBound = "elementId" in element.start;
  const endBound = "elementId" in element.end;
  const arrowStart = element.arrowStart ?? "none";
  const arrowEnd = element.arrowEnd ?? "arrow";

  function detachStart() {
    if (!startBound) return;
    const freePoint = detachConnectorEndpoint(
      element.start as ConnectorEndpoint,
      elements,
    );
    onUpdateElement(element.id, { start: freePoint });
  }

  function detachEnd() {
    if (!endBound) return;
    const freePoint = detachConnectorEndpoint(
      element.end as ConnectorEndpoint,
      elements,
    );
    onUpdateElement(element.id, { end: freePoint });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Arrowhead at start */}
      <label className="block">
        <span className={LABEL_CLASS}>Arrow at start</span>
        <select
          value={arrowStart}
          onChange={(event) =>
            onUpdateElement(element.id, {
              arrowStart: event.target.value as ConnectorArrow,
            })
          }
          className={`${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Arrowhead style at start"
        >
          {ARROW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* Arrowhead at end */}
      <label className="block">
        <span className={LABEL_CLASS}>Arrow at end</span>
        <select
          value={arrowEnd}
          onChange={(event) =>
            onUpdateElement(element.id, {
              arrowEnd: event.target.value as ConnectorArrow,
            })
          }
          className={`${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Arrowhead style at end"
        >
          {ARROW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* Dashed line toggle */}
      <label className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS + " mb-0"}>Dashed line</span>
        <input
          type="checkbox"
          checked={element.dash ?? false}
          onChange={(event) =>
            onUpdateElement(element.id, { dash: event.target.checked })
          }
          className="h-4 w-4 accent-ds-accent"
          aria-label="Toggle dashed line style"
        />
      </label>

      {/* Stroke color */}
      <label className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS + " mb-0"}>Stroke color</span>
        <input
          type="color"
          value={element.stroke?.color ?? "#a1a1aa"}
          onChange={(event) =>
            onUpdateElement(element.id, {
              stroke: {
                color: event.target.value,
                width: element.stroke?.width ?? 0.4,
              },
            })
          }
          className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
          aria-label="Stroke color"
        />
      </label>

      {/* Stroke width */}
      <label className="block">
        <span className={LABEL_CLASS}>Stroke width</span>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={element.stroke?.width ?? 0.4}
          onChange={(event) => {
            const width = Number(event.target.value);
            onUpdateElement(element.id, {
              stroke: {
                color: element.stroke?.color ?? "#a1a1aa",
                width,
              },
            });
          }}
          className="w-full accent-ds-accent"
          aria-label="Stroke width"
        />
      </label>

      {/* Detach endpoint buttons — disabled when the endpoint is already free */}
      <div>
        <span className={LABEL_CLASS}>Endpoints</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!startBound}
            onClick={detachStart}
            aria-label="Detach start endpoint from shape"
            title={
              startBound
                ? "Detach start from its bound shape"
                : "Start endpoint is already free"
            }
            className={`flex flex-1 items-center justify-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            <Link2Off size={12} aria-hidden="true" />
            Start
          </button>
          <button
            type="button"
            disabled={!endBound}
            onClick={detachEnd}
            aria-label="Detach end endpoint from shape"
            title={
              endBound
                ? "Detach end from its bound shape"
                : "End endpoint is already free"
            }
            className={`flex flex-1 items-center justify-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            <Link2Off size={12} aria-hidden="true" />
            End
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inspector controls for a selected visual element: a live thumbnail preview of
 * the referenced document visual (reflecting any restyle) plus a "Restyle" row
 * of theme presets. Selecting a theme stores `styleThemeId` on the element; the
 * shared `VisualElementView` re-tints the visual via `applyTheme` so the editor,
 * present mode and public viewer stay identical. "Original" clears the override.
 */
function VisualElementEditor({
  element,
  visuals,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "visual" }>;
  visuals: ReadonlyMap<string, Visual>;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const visual = visuals.get(element.visualId);

  if (!visual) {
    return (
      <p className="text-xs text-ds-text-muted">
        This visual is no longer in the document. Delete it or pick another from
        the Add menu.
      </p>
    );
  }

  const preview = element.styleThemeId
    ? applyTheme(visual, element.styleThemeId)
    : visual;
  const usingOriginal = !element.styleThemeId;

  return (
    <div className="flex flex-col gap-3">
      <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-base">
        <VisualRenderer
          visual={preview}
          className="h-full w-full object-contain"
          transparentBackground
        />
      </span>

      <div>
        <span className={LABEL_CLASS}>Restyle</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={usingOriginal}
            onClick={() =>
              onUpdateElement(element.id, { styleThemeId: undefined })
            }
            className={`rounded-ds-sm border px-2 py-1 text-xs font-medium transition-colors ${
              usingOriginal
                ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
                : "border-ds-border-subtle text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Original
          </button>
          {STYLE_THEMES.map((theme) => {
            const active =
              element.styleThemeId === theme.id ||
              (usingOriginal && isThemeActive(visual, theme.id));
            return (
              <Tooltip key={theme.id} label={theme.name} side="bottom">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Restyle as ${theme.name}`}
                  onClick={() =>
                    onUpdateElement(element.id, { styleThemeId: theme.id })
                  }
                  className={`flex h-7 w-7 items-center justify-center rounded-ds-sm border transition-shadow ${
                    active
                      ? "ring-2 ring-ds-focus-ring ring-offset-1 ring-offset-ds-focus-offset"
                      : "border-ds-border-subtle"
                  } ${FOCUS_RING}`}
                  style={{ backgroundColor: theme.colors.nodeStroke }}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Numeric box field (percent units). Commits clamped values to the element box.
 */
function NumberField({
  label,
  value,
  min = 0,
  max = 100,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ds-text-muted">{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        step={1}
        onChange={(event) => {
          const n = Number(event.target.value);
          if (Number.isFinite(n)) {
            onCommit(Math.max(min, Math.min(max, n)));
          }
        }}
        className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

/**
 * Shared position & size editor for any element (percent units). Height is only
 * offered for non-text kinds, since text / bullets height auto-fits the content.
 */
function ElementArrangeControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const { x, y, w, h } = element.box;
  const showHeight = element.kind !== "text" && element.kind !== "bullets";
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
 * Shared effects (drop shadow) and lock toggles for any selected element.
 */
function ElementEffectsControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  return (
    <div className="mt-3 flex items-center gap-4">
      <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
        <input
          type="checkbox"
          checked={element.shadow ?? false}
          onChange={(event) =>
            onUpdateElement(element.id, {
              shadow: event.target.checked ? true : undefined,
            })
          }
          className="accent-ds-accent"
        />
        Shadow
      </label>
      <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
        <input
          type="checkbox"
          checked={element.locked ?? false}
          onChange={(event) =>
            onUpdateElement(element.id, {
              locked: event.target.checked ? true : undefined,
            })
          }
          className="accent-ds-accent"
        />
        Lock
      </label>
    </div>
  );
}

/**
 * Shared opacity slider shown for any selected element. Stores `opacity` on the
 * element (cleared to `undefined` at 100% so fully-opaque elements stay clean).
 */
function ElementOpacityControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const value = element.opacity ?? 1;
  const pct = Math.round(value * 100);
  return (
    <label className="mt-3 block">
      <span className={`${LABEL_CLASS} flex items-center justify-between`}>
        <span>Opacity</span>
        <span className="tabular-nums text-ds-text-muted">{pct}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(event) => {
          const next = Number(event.target.value) / 100;
          onUpdateElement(element.id, {
            opacity: next >= 1 ? undefined : next,
          });
        }}
        className="w-full accent-ds-accent"
        aria-label="Element opacity"
      />
    </label>
  );
}

/**
 * Font-family picker for text / bullets elements. Stores a CSS font stack in
 * `style.fontFamily` (cleared to inherit the base font when "Default").
 */
function FontFamilyControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>Font</span>
      <select
        value={style.fontFamily ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          const next = { ...style };
          if (value) next.fontFamily = value;
          else delete next.fontFamily;
          onChange(next);
        }}
        className={`${FIELD_CLASS} ${FOCUS_RING}`}
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font.label} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Small icon-button used inside the multi-select tools grid. */
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
  children: React.ReactNode;
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

/**
 * Inline tool-group row shown inside the multi-select tools panel.
 * Renders a label and a horizontal row of icon buttons.
 */
function ToolRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ds-text-muted">{label}</span>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

/**
 * Multi-select tools panel (issue #328).
 * Shown when 2+ elements are selected. Provides align, distribute, match-size,
 * and arrange operations. All operations are undoable as one history step.
 */
function MultiSelectTools({
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

        {/* Distribute */}
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

        {/* Match size */}
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

        {/* Arrange */}
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
    </div>
  );
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
    selectedElement?.kind === "image" || selectedElement?.kind === "visual";
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
                selectedElement.kind === "visual" ? (
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
                    Media settings are available for images and document
                    visuals.
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

        {panel === "notes" ? (
          <div
            role="tabpanel"
            id="inspector-panel-notes"
            aria-labelledby="inspector-tab-notes"
            className="flex flex-col gap-4"
          >
            <SpeakerNotesControl notes={slide.notes} onChange={onUpdateNotes} />
          </div>
        ) : null}

        {panel === "source" ? (
          <div
            role="tabpanel"
            id="inspector-panel-source"
            aria-labelledby="inspector-tab-source"
            className="flex flex-col gap-4"
          >
            <SourceSummary element={selectedElement} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Read-only summary of a selected element's source-document link. The
 * authoritative link controls live in the stage toolbar's "From document"
 * menu; this panel only surfaces the current provenance state (issue #580).
 */
function SourceSummary({
  element,
}: {
  element: SlideElement | null | undefined;
}) {
  if (!element) {
    return (
      <p className="text-xs text-ds-text-muted">
        Select an element to see its document source link.
      </p>
    );
  }
  const ref = element.sourceRef;
  if (!ref || ref.unlinked) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ds-text-primary">
          Not linked to a document
        </p>
        <p className="text-xs text-ds-text-muted">
          This element is standalone. Insert content from the stage toolbar’s
          “From document” menu to establish a source link.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ds-text-primary">
          Linked to document
        </p>
        <p className="text-xs text-ds-text-muted">
          Source edits can be synced from the stage toolbar’s “From document”
          menu.
        </p>
      </div>
      <dl className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ds-text-muted">Block kind</dt>
          <dd className="font-medium capitalize text-ds-text-secondary">
            {ref.blockKind}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="shrink-0 text-ds-text-muted">Block id</dt>
          <dd className="truncate font-mono text-ds-text-secondary">
            {ref.blockId}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ds-text-muted">Linked</dt>
          <dd className="text-ds-text-secondary">
            {new Date(ref.linkedAt).toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Per-slide color override. The deck-theme preset swatches are the primary
 * interaction; the raw `<input type=color>` is hidden behind a "Custom…"
 * progressive-disclosure toggle so the token-driven theme colors stay
 * front-and-centre. "Theme" clears the override entirely.
 */
function ColorOverride({
  label,
  value,
  fallback,
  presets,
  onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  presets: readonly string[];
  onChange: (color: string | undefined) => void;
}) {
  const normalized = value?.toLowerCase();
  const matchesPreset =
    normalized !== undefined &&
    presets.some((preset) => preset.toLowerCase() === normalized);
  const [showCustom, setShowCustom] = useState(
    value !== undefined && !matchesPreset,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ds-text-secondary">
          {label}
        </span>
        {value !== undefined ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`text-xs text-ds-text-muted underline hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Theme
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => (
          <Swatch
            key={preset}
            color={preset}
            size="md"
            selected={normalized === preset.toLowerCase()}
            aria-label={`${label} ${preset}`}
            onClick={() => onChange(preset)}
          />
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((open) => !open)}
          aria-expanded={showCustom}
          className={`ml-0.5 text-xs text-ds-text-muted underline hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Custom…
        </button>
      </div>
      {showCustom ? (
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={value ?? fallback}
            onChange={(event) => onChange(event.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
            aria-label={`${label} custom color`}
          />
          <span className="font-mono text-xs tabular-nums text-ds-text-secondary">
            {(value ?? fallback).toLowerCase()}
          </span>
        </label>
      ) : null}
    </div>
  );
}
