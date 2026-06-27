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
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/ui/tokens";
import { useCoalesceSession } from "@/lib/presentation/gesture-primitives";
import {
  PropRow,
  PanelSection,
  SelectField,
} from "@/components/presentation/slide-inspector/primitives";
import type { SlideInspectorProps } from "@/components/presentation/slide-inspector/types";
import { Swatch, Tooltip } from "@/components/ui";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type {
  ConnectorArrow,
  ConnectorElement,
  ConnectorEndpoint,
  Deck,
  ImageCrop,
  ImageElement,
  ImageFitMode,
  ImageMaskShape,
  Paragraph,
  ShapeKind,
  Slide,
  SlideElement,
  TextElementStyle,
  TextFitMode,
  TextRun,
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
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import { detachConnectorEndpoint } from "@/lib/presentation/connector-lifecycle";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import {
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
} from "@/lib/presentation/rich-text-html";
import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  stepFontSize,
} from "@/lib/presentation/text-style";
import {
  SLIDE_FONT_OPTIONS,
  matchSlideFont,
} from "@/lib/presentation/slide-fonts";
import type { Visual } from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { applyTheme, isThemeActive } from "@/lib/visual/transforms";
import { assertNever } from "@/lib/assert-never";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import {
  connectorContent,
  connectorDesign,
  elementDesignOverrides,
  imageContent,
  imageDesign,
  presentationRoleToDeckTextRole,
  shapeContent,
  shapeTextDesign,
  textContent,
  textDesign,
  visualContent,
} from "@/components/presentation/slide-canvas/v6-model";

const SHAPE_OPTIONS: ShapeKind[] = ["rect", "ellipse", "line", "triangle"];

/**
 * Selectable slide fonts for text/bullets elements. Each `value` is a stable
 * slide `fontId` from the self-hosted registry; the empty value inherits the
 * theme/role font.
 */
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  ...SLIDE_FONT_OPTIONS.map((font) => ({
    label: font.label,
    value: font.id,
  })),
];

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-[13px] text-ds-text-primary outline-none";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

const DEFAULT_SHAPE_TEXT_STYLE: TextElementStyle = {
  fontSize: 4,
  bold: false,
  italic: false,
  align: "center",
};

/**
 * Module-level counter so every `RichTextBox` focus session gets a globally
 * unique coalesce key. Incrementing once per session (not per keystroke) means
 * the entire typed run collapses to one undo step, and each new focus session
 * starts a fresh entry (issue #306).
 */

export function RichTextBox({
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
  const { coalesceKeyRef, onSessionStart, onSessionEnd } =
    useCoalesceSession("rich-text-edit");

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
        onFocus={onSessionStart}
        onBlur={() => {
          emitChange();
          onSessionEnd();
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
export function ImageElementEditor({
  element,
  deck,
  showAdvanced,
  onUpdateElement,
  documentId,
  slideAssetPort,
}: {
  element: ImageElement;
  deck: Deck;
  showAdvanced: boolean;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const content = imageContent(element);
  const design = imageDesign(element);

  const { handleFile } = useImageUpload({
    deck,
    currentSrc: content.src,
    onAccept: (src, assetId) => {
      setError(null);
      onUpdateElement(element.id, {
        content: {
          ...(element as { content?: Record<string, unknown> }).content,
          kind: "image",
          src,
          ...(assetId ? { assetId } : {}),
        },
      } as ElementPatch);
    },
    onError: (message) => setError(message),
    documentId,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
  });

  const hasSource = !isEmptyImageSrc(content.src);

  return (
    <>
      <PanelSection title="Image">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex w-full items-center justify-center gap-2 rounded-ds-md border border-dashed border-ds-border-subtle bg-ds-surface px-2 py-2 text-[13px] text-ds-text-secondary transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
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
          <p role="alert" className="text-xs text-ds-danger-text">
            {error}
          </p>
        ) : null}
        <label className="block">
          <span className={LABEL_CLASS}>Image URL</span>
          <input
            type="text"
            value={content.src ?? ""}
            onChange={(event) =>
              onUpdateElement(element.id, {
                content: {
                  ...(element as { content?: Record<string, unknown> }).content,
                  kind: "image",
                  src: event.target.value,
                },
              } as ElementPatch)
            }
            placeholder="https://… or data:image/…"
            className={`${FIELD_CLASS} ${FOCUS_RING}`}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Alt text</span>
          <input
            type="text"
            value={content.alt ?? ""}
            onChange={(event) =>
              onUpdateElement(element.id, {
                content: {
                  ...(element as { content?: Record<string, unknown> }).content,
                  kind: "image",
                  alt: event.target.value,
                },
              } as ElementPatch)
            }
            className={`${FIELD_CLASS} ${FOCUS_RING}`}
          />
        </label>
      </PanelSection>
      <PanelSection title="Adjust">
        <ImageFitModeControl
          fitMode={design.fitMode}
          onChange={(fitMode) =>
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                fitMode,
              },
            } as ElementPatch)
          }
        />
        <ImageMaskControl
          maskShape={design.maskShape}
          onChange={(maskShape) =>
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                maskShape,
              },
            } as ElementPatch)
          }
        />
        <ImageCropControl
          crop={content.crop}
          onChange={(crop) =>
            onUpdateElement(element.id, {
              content: {
                ...(element as { content?: Record<string, unknown> }).content,
                kind: "image",
                crop,
              },
            } as ElementPatch)
          }
        />
        {showAdvanced ? (
          <PropRow label="Radius">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={design.radius ?? 0}
              onChange={(event) => {
                const radius = Number(event.target.value);
                onUpdateElement(element.id, {
                  designOverrides: {
                    ...elementDesignOverrides(element),
                    radius: radius <= 0 ? undefined : radius,
                  },
                } as ElementPatch);
              }}
              className="min-w-0 flex-1 accent-ds-accent"
              aria-label="Image corner radius"
            />
          </PropRow>
        ) : null}
      </PanelSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Image controls
// ---------------------------------------------------------------------------

export const IMAGE_FIT_MODE_OPTIONS: {
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

export const IMAGE_MASK_OPTIONS: { value: ImageMaskShape; label: string }[] = [
  { value: "none", label: "None" },
  { value: "circle", label: "Circle" },
  { value: "rounded", label: "Rounded" },
  { value: "diamond", label: "Diamond" },
];

export function ImageFitModeControl({
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

export function ImageMaskControl({
  maskShape,
  onChange,
}: {
  maskShape: ImageMaskShape | undefined;
  onChange: (maskShape: ImageMaskShape | undefined) => void;
}) {
  return (
    <PropRow label="Mask">
      <SelectField
        value={maskShape ?? "none"}
        ariaLabel="Image mask shape"
        onChange={(value) =>
          onChange(value === "none" ? undefined : (value as ImageMaskShape))
        }
        options={IMAGE_MASK_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
    </PropRow>
  );
}

export function ImageCropControl({
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

export const FIT_MODE_OPTIONS: {
  value: TextFitMode;
  label: string;
  title: string;
}[] = [
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

export function FitModeControl({
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

export const VERTICAL_ALIGN_OPTIONS: {
  value: VerticalAlignValue;
  label: string;
  title: string;
}[] = [
  { value: "top", label: "Top", title: "Align text to top" },
  { value: "middle", label: "Mid", title: "Center text vertically (default)" },
  { value: "bottom", label: "Bot", title: "Align text to bottom" },
];

export function VerticalAlignControl({
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

export const LINE_HEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 1.0, label: "1.0" },
  { value: 1.2, label: "1.2" },
  { value: 1.5, label: "1.5" },
  { value: 2.0, label: "2.0" },
];

export function LineHeightControl({
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

export function ParagraphSpacingControl({
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

export function BulletGapControl({
  element,
  onChange,
}: {
  element: Extract<SlideElement, { kind: "text" }>;
  onChange: (patch: ElementPatch) => void;
}) {
  const content = textContent(element);
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Bullet gap</span>
      <input
        type="number"
        min={0}
        max={20}
        step={0.5}
        value={content.bulletGap ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange({
            content: {
              ...content,
              kind: "text",
              bulletGap: !Number.isFinite(v) || v <= 0 ? undefined : v,
            },
          } as ElementPatch);
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

export function BulletIndentControl({
  element,
  onChange,
}: {
  element: Extract<SlideElement, { kind: "text" }>;
  onChange: (patch: ElementPatch) => void;
}) {
  const content = textContent(element);
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Bullet indent</span>
      <input
        type="number"
        min={0}
        max={30}
        step={1}
        value={content.bulletIndent ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange({
            content: {
              ...content,
              kind: "text",
              bulletIndent: !Number.isFinite(v) || v <= 0 ? undefined : v,
            },
          } as ElementPatch);
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
export function ListTypeControl({
  element,
  onChange,
}: {
  element: Extract<SlideElement, { kind: "text" }>;
  onChange: (patch: ElementPatch) => void;
}) {
  const content = textContent(element);
  const items = content.paragraphs;
  // Consider the list "numbered" if a majority of items are numbered.
  const numberedCount = items.filter(
    (it: Paragraph) => it.listType === "number",
  ).length;
  const isNumbered = items.length > 0 && numberedCount > items.length / 2;

  function toggle() {
    const targetType = isNumbered ? "bullet" : "number";
    const newItems: Paragraph[] = items.map((it: Paragraph) => ({
      ...it,
      listType: targetType,
    }));
    onChange({
      content: {
        ...content,
        kind: "text",
        paragraphs: newItems,
      },
    } as ElementPatch);
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

/** Hex color test used by the inheritance-aware color control. */
function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Semantic roles offered per element kind in the Text panel (#615). */
export const TEXT_ROLE_OPTIONS: Readonly<
  Record<
    "text" | "bullets" | "shape",
    ReadonlyArray<{ value: DeckTextRole; label: string }>
  >
> = {
  text: [
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "subtitle", label: "Subtitle" },
    { value: "body", label: "Body" },
    { value: "caption", label: "Caption" },
  ],
  bullets: [
    { value: "bullet", label: "Bullet" },
    { value: "body", label: "Body" },
  ],
  shape: [
    { value: "shapeLabel", label: "Shape label" },
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "body", label: "Body" },
    { value: "caption", label: "Caption" },
  ],
};

/** The role an element inherits when it carries no explicit `textRole`. */
function defaultTextRole(element: SlideElement): DeckTextRole {
  return presentationRoleToDeckTextRole(
    (element as { role?: string }).role,
    element.kind === "text" ? "body" : "shapeLabel",
  );
}

function deckTextRoleToPresentationRole(role: DeckTextRole): string {
  switch (role) {
    case "h1":
      return "title";
    case "h2":
      return "sectionTitle";
    case "shapeLabel":
      return "label";
    default:
      return role;
  }
}

/** Elements that carry a semantic text role + local style override (#615). */
type TextBearingElement = Extract<SlideElement, { kind: "text" | "shape" }>;

/** Role dropdown: switches the element's semantic typography role (#615). */
export function RoleSelectControl({
  element,
  onChange,
}: {
  element: TextBearingElement;
  onChange: (role: DeckTextRole) => void;
}) {
  const kindKey = element.kind === "shape" ? "shape" : "text";
  const options = TEXT_ROLE_OPTIONS[kindKey];
  const current = defaultTextRole(element);
  return (
    <div className="flex flex-col gap-1.5">
      <PropRow label="Role">
        <SelectField
          value={current}
          ariaLabel="Text role"
          onChange={(value) => onChange(value as DeckTextRole)}
          options={options.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </PropRow>
      <span className="text-[11px] text-ds-text-muted">
        Inherits theme typography for this role; edits below override it
        locally.
      </span>
    </div>
  );
}

/**
 * Header row marking a property as inherited or locally overridden, with a
 * per-property reset to the inherited theme value (#615).
 */
export function OverrideHeader({
  label,
  overridden,
  onReset,
}: {
  label: string;
  overridden: boolean;
  onReset: () => void;
}) {
  return (
    <span className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-ds-text-secondary">
        {label}
      </span>
      {overridden ? (
        <span className="flex items-center gap-1.5">
          <span className="rounded-ds-sm bg-ds-state-hover px-1 py-0.5 text-[10px] font-medium text-ds-text-secondary">
            Custom
          </span>
          <button
            type="button"
            onClick={onReset}
            className={`rounded-ds-sm text-[11px] text-ds-text-secondary underline-offset-2 hover:underline ${FOCUS_RING}`}
          >
            Reset
          </button>
        </span>
      ) : (
        <span className="text-[10px] text-ds-text-muted">Inherited</span>
      )}
    </span>
  );
}

/**
 * Font-size stepper. The right Text panel owns precise typography size, so it
 * is intentionally absent from the on-canvas context toolbar (#651, #635).
 * Size is a percent of slide height, snapped to FONT_STEP and clamped to
 * [FONT_MIN, FONT_MAX].
 */
export function FontSizeControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const size = style.fontSize;
  const setSize = (next: number) => onChange({ ...style, fontSize: next });
  const btnClass = `flex h-7 w-7 items-center justify-center rounded-ds-sm border border-ds-border-subtle text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
  return (
    <div className="block">
      <span className={LABEL_CLASS}>Size</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Decrease font size"
          disabled={size <= FONT_MIN}
          onClick={() => setSize(stepFontSize(size, -FONT_STEP))}
          className={btnClass}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <input
          type="number"
          min={FONT_MIN}
          max={FONT_MAX}
          step={FONT_STEP}
          value={size}
          aria-label="Font size"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) setSize(stepFontSize(next, 0));
          }}
          className={`w-16 text-center ${FIELD_CLASS} ${FOCUS_RING}`}
        />
        <button
          type="button"
          aria-label="Increase font size"
          disabled={size >= FONT_MAX}
          onClick={() => setSize(stepFontSize(size, FONT_STEP))}
          className={btnClass}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Font control that surfaces inherited vs. local state with reset (#615). */
export function InheritedFontControl({
  style,
  inheritedLabel,
  onChange,
}: {
  style: TextElementStyle;
  inheritedLabel: string;
  onChange: (style: TextElementStyle) => void;
}) {
  const overridden = style.fontId !== undefined;
  return (
    <div className="block">
      <OverrideHeader
        label="Font"
        overridden={overridden}
        onReset={() => {
          const next = { ...style };
          delete next.fontId;
          onChange(next);
        }}
      />
      <SelectField
        value={style.fontId ?? ""}
        ariaLabel="Font family"
        onChange={(value) => {
          const next = { ...style };
          if (value) next.fontId = value;
          else delete next.fontId;
          onChange(next);
        }}
        options={[
          { value: "", label: `Theme default (${inheritedLabel})` },
          ...FONT_FAMILIES.filter((font) => font.value).map((font) => ({
            value: font.value,
            label: font.label,
          })),
        ]}
      />
    </div>
  );
}

/** Color control that surfaces inherited vs. local state with reset (#615). */
export function InheritedColorControl({
  style,
  inheritedColor,
  onChange,
}: {
  style: TextElementStyle;
  inheritedColor: string;
  onChange: (style: TextElementStyle) => void;
}) {
  const overridden = style.color !== undefined;
  const value = style.color ?? inheritedColor;
  const setColor = (hex: string) => onChange({ ...style, color: hex });
  return (
    <div className="block">
      <OverrideHeader
        label="Color"
        overridden={overridden}
        onReset={() => {
          const next = { ...style };
          delete next.color;
          onChange(next);
        }}
      />
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Text color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(event) => setColor(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded-ds-sm border border-ds-border-subtle bg-ds-surface"
        />
        <input
          key={value}
          type="text"
          spellCheck={false}
          defaultValue={value}
          aria-label="Text color hex"
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (isHexColor(next) && next.toLowerCase() !== value.toLowerCase())
              setColor(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter")
              (event.target as HTMLInputElement).blur();
          }}
          className={`w-24 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 py-1 font-mono text-[11px] text-ds-text-primary ${FOCUS_RING}`}
        />
      </div>
    </div>
  );
}

export function TextPanel({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: SlideElement | null;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  if (!element) {
    return (
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          Select a text-bearing element to edit typography.
        </p>
      </PanelSection>
    );
  }

  if (
    element.kind !== "text" &&
    !(element.kind === "shape" && shapeContent(element).shape !== "line")
  ) {
    return (
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          Text settings are available for text, bullets, and labeled shapes.
        </p>
      </PanelSection>
    );
  }

  const style =
    element.kind === "shape"
      ? { ...DEFAULT_SHAPE_TEXT_STYLE, ...shapeTextDesign(element) }
      : {
          fontSize: SLIDE_TEXT_FONT_SIZE.text,
          bold: false,
          italic: false,
          align: "left" as const,
          ...textDesign(element),
        };
  const updateStyle = (next: TextElementStyle) => {
    onUpdateElement(element.id, {
      designOverrides: {
        ...elementDesignOverrides(element),
        textStyle: next,
      },
    } as ElementPatch);
  };

  // Resolve the inherited (role-token) values so the panel can show what the
  // element falls back to and mark per-property local overrides (#615).
  const role = defaultTextRole(element);
  const tokenSet = resolveSlideTokenSet(deck, slide);
  const roleToken = resolveRoleToken(tokenSet, role);
  const inheritedColor = roleToken.color;
  const inheritedFontLabel =
    matchSlideFont(roleToken.fontFamily ?? tokenSet.typography.fontFamily)
      ?.label ?? "theme font";

  const hasList =
    element.kind === "text" &&
    textContent(element).paragraphs.some(
      (paragraph) => paragraph.listType !== undefined,
    );

  return (
    <>
      <PanelSection title="Font">
        <RoleSelectControl
          element={element}
          onChange={(textRole) =>
            onUpdateElement(element.id, {
              role: deckTextRoleToPresentationRole(textRole),
            } as ElementPatch)
          }
        />
        <InheritedColorControl
          style={style}
          inheritedColor={inheritedColor}
          onChange={updateStyle}
        />
        <InheritedFontControl
          style={style}
          inheritedLabel={inheritedFontLabel}
          onChange={updateStyle}
        />
        <FontSizeControl style={style} onChange={updateStyle} />
        <LineHeightControl style={style} onChange={updateStyle} />
      </PanelSection>

      <PanelSection title="Paragraph">
        {element.kind === "text" || element.kind === "shape" ? (
          <ParagraphSpacingControl style={style} onChange={updateStyle} />
        ) : null}
        <VerticalAlignControl style={style} onChange={updateStyle} />
        {element.kind === "text" ? (
          <FitModeControl
            fitMode={textContent(element).fitMode}
            onChange={(fitMode) =>
              onUpdateElement(element.id, {
                content: {
                  ...textContent(element),
                  kind: "text",
                  fitMode,
                },
              } as ElementPatch)
            }
          />
        ) : null}
        {hasList && element.kind === "text" ? (
          <>
            <ListTypeControl
              element={element}
              onChange={(patch) => onUpdateElement(element.id, patch)}
            />
            <BulletIndentControl
              element={element}
              onChange={(patch) => onUpdateElement(element.id, patch)}
            />
            <BulletGapControl
              element={element}
              onChange={(patch) => onUpdateElement(element.id, patch)}
            />
          </>
        ) : null}
      </PanelSection>
    </>
  );
}

export function EffectsPanel({
  element,
  onUpdateElement,
}: {
  element: SlideElement | null;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  if (!element) {
    return (
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          Select an element to edit effects.
        </p>
      </PanelSection>
    );
  }
  return (
    <PanelSection title="Effects">
      <ElementOpacityControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
      <ElementEffectsControl
        element={element}
        onUpdateElement={onUpdateElement}
      />
    </PanelSection>
  );
}

export function ElementEditor({
  element,
  deck,
  visuals,
  showAdvanced,
  elements,
  onUpdateElement,
  documentId,
  slideAssetPort,
}: {
  element: SlideElement;
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  showAdvanced: boolean;
  elements: readonly SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
}) {
  switch (element.kind) {
    case "text":
      const currentText = textContent(element);
      const currentTextStyle = {
        fontSize: SLIDE_TEXT_FONT_SIZE.text,
        bold: false,
        italic: false,
        align: "left" as const,
        ...textDesign(element),
      };
      return (
        <PanelSection title="Text">
          <RichTextBox
            label="Text"
            html={runsToHtml(currentText.runs, currentText.text)}
            onChange={({ text, runs }, coalesceKey) =>
              onUpdateElement(
                element.id,
                {
                  content: {
                    ...currentText,
                    kind: "text",
                    text,
                    runs: shouldStoreRuns(runs) ? runs : undefined,
                    paragraphs: [
                      {
                        text,
                        ...(shouldStoreRuns(runs) ? { runs } : {}),
                      },
                    ],
                  },
                } as ElementPatch,
                coalesceKey,
              )
            }
          />
          <FontFamilyControl
            style={currentTextStyle}
            onChange={(style) =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  textStyle: style,
                },
              } as ElementPatch)
            }
          />
          <FitModeControl
            fitMode={currentText.fitMode}
            onChange={(fitMode) =>
              onUpdateElement(element.id, {
                content: { ...currentText, kind: "text", fitMode },
              } as ElementPatch)
            }
          />
          <VerticalAlignControl
            style={currentTextStyle}
            onChange={(style) =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  textStyle: style,
                },
              } as ElementPatch)
            }
          />
          <LineHeightControl
            style={currentTextStyle}
            onChange={(style) =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  textStyle: style,
                },
              } as ElementPatch)
            }
          />
          <ParagraphSpacingControl
            style={currentTextStyle}
            onChange={(style) =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  textStyle: style,
                },
              } as ElementPatch)
            }
          />
        </PanelSection>
      );
    case "image":
      return (
        <ImageElementEditor
          element={element}
          deck={deck}
          showAdvanced={showAdvanced}
          onUpdateElement={onUpdateElement}
          documentId={documentId}
          slideAssetPort={slideAssetPort}
        />
      );
    case "shape":
      const currentShape = shapeContent(element);
      const currentShapeDesign = elementDesignOverrides(element);
      const currentStroke = currentShapeDesign.stroke as
        | { color: string; width: number }
        | undefined;
      const currentFill =
        typeof (currentShapeDesign.fill as { value?: unknown } | undefined)
          ?.value === "string"
          ? (currentShapeDesign.fill as { value: string }).value
          : "#6366f1";
      return (
        <>
          {currentShape.shape !== "line" ? (
            <PanelSection title="Label">
              <RichTextBox
                label="Text"
                html={runsToHtml(
                  currentShape.textRuns,
                  currentShape.text ?? "",
                )}
                onChange={({ text, runs }, coalesceKey) =>
                  onUpdateElement(
                    element.id,
                    {
                      content: {
                        ...currentShape,
                        kind: "shape",
                        text: text.trim().length > 0 ? text : undefined,
                        textRuns:
                          shouldStoreRuns(runs) && text.trim().length > 0
                            ? runs
                            : undefined,
                      },
                    } as ElementPatch,
                    coalesceKey,
                  )
                }
              />
            </PanelSection>
          ) : null}
          <PanelSection title="Shape">
            <PropRow label="Kind">
              <SelectField
                value={currentShape.shape}
                ariaLabel="Shape kind"
                onChange={(value) =>
                  onUpdateElement(element.id, {
                    content: {
                      ...currentShape,
                      kind: "shape",
                      shape: value as ShapeKind,
                    },
                  } as ElementPatch)
                }
                options={SHAPE_OPTIONS.map((shape) => ({
                  value: shape,
                  label: shape,
                }))}
              />
            </PropRow>
            {currentShape.shape !== "triangle" ? (
              <PropRow
                label={currentShape.shape === "line" ? "Thickness" : "Border"}
              >
                {currentShape.shape !== "line" ? (
                  <input
                    type="color"
                    value={currentStroke?.color ?? "#000000"}
                    onChange={(event) =>
                      onUpdateElement(element.id, {
                        designOverrides: {
                          ...currentShapeDesign,
                          stroke: {
                            color: event.target.value,
                            width: currentStroke?.width ?? 0.4,
                          },
                        },
                      } as ElementPatch)
                    }
                    className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
                    aria-label="Border color"
                  />
                ) : null}
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.25}
                  value={
                    currentStroke?.width ??
                    (currentShape.shape === "line" ? 0.4 : 0)
                  }
                  onChange={(event) => {
                    const width = Number(event.target.value);
                    onUpdateElement(element.id, {
                      designOverrides: {
                        ...currentShapeDesign,
                        stroke:
                          width <= 0
                            ? undefined
                            : {
                                color:
                                  currentStroke?.color ??
                                  (currentShape.shape === "line"
                                    ? currentFill
                                    : "#000000"),
                                width,
                              },
                      },
                    } as ElementPatch);
                  }}
                  className="min-w-0 flex-1 accent-ds-accent"
                  aria-label={
                    currentShape.shape === "line"
                      ? "Line thickness"
                      : "Border width"
                  }
                />
              </PropRow>
            ) : null}
            {currentShape.shape === "rect" && showAdvanced ? (
              <PropRow label="Radius">
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={
                    typeof currentShapeDesign.radius === "number"
                      ? currentShapeDesign.radius
                      : 0
                  }
                  onChange={(event) => {
                    const radius = Number(event.target.value);
                    onUpdateElement(element.id, {
                      designOverrides: {
                        ...currentShapeDesign,
                        radius: radius <= 0 ? undefined : radius,
                      },
                    } as ElementPatch);
                  }}
                  className="min-w-0 flex-1 accent-ds-accent"
                  aria-label="Corner radius"
                />
              </PropRow>
            ) : null}
          </PanelSection>
        </>
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
      return assertNever(element);
  }
}

export const ARROW_OPTIONS: { value: ConnectorArrow; label: string }[] = [
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
export function ConnectorElementEditor({
  element,
  elements,
  onUpdateElement,
}: {
  element: ConnectorElement;
  elements: readonly SlideElement[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const content = connectorContent(element);
  const design = connectorDesign(element);
  const startBound = "elementId" in content.start;
  const endBound = "elementId" in content.end;
  const arrowStart = design.arrowStart ?? "none";
  const arrowEnd = design.arrowEnd ?? "arrow";

  function detachStart() {
    if (!startBound) return;
    const freePoint = detachConnectorEndpoint(
      content.start as ConnectorEndpoint,
      elements,
    );
    onUpdateElement(element.id, {
      content: { ...content, kind: "connector", start: freePoint },
    } as ElementPatch);
  }

  function detachEnd() {
    if (!endBound) return;
    const freePoint = detachConnectorEndpoint(
      content.end as ConnectorEndpoint,
      elements,
    );
    onUpdateElement(element.id, {
      content: { ...content, kind: "connector", end: freePoint },
    } as ElementPatch);
  }

  return (
    <PanelSection title="Line">
      {/* Arrowhead at start */}
      <PropRow label="Arrow start">
        <SelectField
          value={arrowStart}
          ariaLabel="Arrowhead style at start"
          onChange={(value) =>
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                arrowStart: value as ConnectorArrow,
              },
            } as ElementPatch)
          }
          options={ARROW_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
      </PropRow>

      {/* Arrowhead at end */}
      <PropRow label="Arrow end">
        <SelectField
          value={arrowEnd}
          ariaLabel="Arrowhead style at end"
          onChange={(value) =>
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                arrowEnd: value as ConnectorArrow,
              },
            } as ElementPatch)
          }
          options={ARROW_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
      </PropRow>

      {/* Routing */}
      <PropRow label="Routing">
        <SelectField
          value={content.routing ?? "straight"}
          ariaLabel="Connector routing"
          onChange={(value) =>
            onUpdateElement(element.id, {
              content: {
                ...content,
                kind: "connector",
                routing: value as "straight" | "elbow",
              },
            } as ElementPatch)
          }
          options={[
            { value: "straight", label: "Straight" },
            { value: "elbow", label: "Elbow" },
          ]}
        />
      </PropRow>

      {/* Dashed line toggle */}
      <PropRow label="Dashed line">
        <input
          type="checkbox"
          checked={design.dash ?? false}
          onChange={(event) =>
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                dash: event.target.checked,
              },
            } as ElementPatch)
          }
          className="h-4 w-4 accent-ds-accent"
          aria-label="Toggle dashed line style"
        />
      </PropRow>

      {/* Stroke color */}
      <PropRow label="Stroke">
        <input
          type="color"
          value={design.stroke?.color ?? "#a1a1aa"}
          onChange={(event) =>
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                stroke: {
                  color: event.target.value,
                  width: design.stroke?.width ?? 0.4,
                },
              },
            } as ElementPatch)
          }
          className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
          aria-label="Stroke color"
        />
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={design.stroke?.width ?? 0.4}
          onChange={(event) => {
            const width = Number(event.target.value);
            onUpdateElement(element.id, {
              designOverrides: {
                ...elementDesignOverrides(element),
                stroke: {
                  color: design.stroke?.color ?? "#a1a1aa",
                  width,
                },
              },
            } as ElementPatch);
          }}
          className="min-w-0 flex-1 accent-ds-accent"
          aria-label="Stroke width"
        />
      </PropRow>

      {/* Detach endpoint buttons — disabled when the endpoint is already free */}
      <PropRow label="Endpoints" align="center">
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
      </PropRow>
    </PanelSection>
  );
}

/**
 * Inspector controls for a selected visual element: a live thumbnail preview of
 * the referenced document visual (reflecting any restyle) plus a "Restyle" row
 * of theme presets. Selecting a theme stores `styleThemeId` on the element; the
 * shared `VisualElementView` re-tints the visual via `applyTheme` so the editor,
 * present mode and public viewer stay identical. "Original" clears the override.
 */
export function VisualElementEditor({
  element,
  visuals,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "visual" }>;
  visuals: ReadonlyMap<string, Visual>;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const content = visualContent(element);
  const visual = visuals.get(content.visualId);

  if (!visual) {
    return (
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          This visual is no longer in the document. Delete it or pick another
          from the Add menu.
        </p>
      </PanelSection>
    );
  }

  const preview = content.styleThemeId
    ? applyTheme(visual, content.styleThemeId)
    : visual;
  const usingOriginal = !content.styleThemeId;
  const visualOptions = [...visuals.entries()];

  return (
    <PanelSection title="Visual">
      <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-base">
        <VisualRenderer
          visual={preview}
          className="h-full w-full object-contain"
          transparentBackground
        />
      </span>

      {visualOptions.length > 1 ? (
        <PropRow label="Replace">
          <SelectField
            value={content.visualId}
            ariaLabel="Replace visual from document"
            onChange={(value) =>
              onUpdateElement(element.id, {
                content: { ...content, kind: "visual", visualId: value },
              } as ElementPatch)
            }
            options={visualOptions.map(([id, candidate]) => ({
              value: id,
              label: candidate.title?.trim() || `${candidate.type} visual`,
            }))}
          />
        </PropRow>
      ) : null}

      <div>
        <span className={LABEL_CLASS}>Restyle</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={usingOriginal}
            onClick={() =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  styleThemeId: undefined,
                },
              } as ElementPatch)
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
              content.styleThemeId === theme.id ||
              (usingOriginal && isThemeActive(visual, theme.id));
            return (
              <Tooltip key={theme.id} label={theme.name} side="bottom">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Restyle as ${theme.name}`}
                  onClick={() =>
                    onUpdateElement(element.id, {
                      designOverrides: {
                        ...elementDesignOverrides(element),
                        styleThemeId: theme.id,
                      },
                    } as ElementPatch)
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
    </PanelSection>
  );
}

/**
 * Numeric box field (percent units). Commits clamped values to the element box.
 */
export function NumberField({
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
  const numClass = `w-16 text-right ${FIELD_CLASS} ${FOCUS_RING}`;
  const round = (n: number) => Math.round(n * 10) / 10;
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  return (
    <PanelSection title="Position &amp; size">
      <PropRow label="Position">
        <input
          type="number"
          value={round(x)}
          onChange={(event) => {
            const n = Number(event.target.value);
            if (Number.isFinite(n)) update({ x: clamp(n, 0, 100) });
          }}
          className={numClass}
          aria-label="X percent"
        />
        <input
          type="number"
          value={round(y)}
          onChange={(event) => {
            const n = Number(event.target.value);
            if (Number.isFinite(n)) update({ y: clamp(n, 0, 100) });
          }}
          className={numClass}
          aria-label="Y percent"
        />
      </PropRow>
      <PropRow label="Size">
        <input
          type="number"
          min={1}
          value={round(w)}
          onChange={(event) => {
            const n = Number(event.target.value);
            if (Number.isFinite(n)) update({ w: clamp(n, 1, 100) });
          }}
          className={numClass}
          aria-label="Width percent"
        />
        {showHeight ? (
          <input
            type="number"
            min={1}
            value={round(h)}
            onChange={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n)) update({ h: clamp(n, 1, 100) });
            }}
            className={numClass}
            aria-label="Height percent"
          />
        ) : null}
      </PropRow>
      <PropRow label="Rotation">
        <input
          type="number"
          min={-180}
          max={180}
          value={round(rotation)}
          onChange={(event) => {
            const n = Number(event.target.value);
            if (Number.isFinite(n)) {
              const v = clamp(n, -180, 180);
              onUpdateElement(element.id, {
                rotation: v === 0 ? undefined : v,
              });
            }
          }}
          className={numClass}
          aria-label="Rotation degrees"
        />
      </PropRow>
      <PropRow label="Center" align="center">
        <button
          type="button"
          onClick={() => update({ x: (100 - w) / 2 })}
          className={`flex-1 rounded-ds-md border border-ds-border-subtle px-2 py-1.5 text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Horizontal
        </button>
        <button
          type="button"
          onClick={() => update({ y: (100 - h) / 2 })}
          className={`flex-1 rounded-ds-md border border-ds-border-subtle px-2 py-1.5 text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Vertical
        </button>
      </PropRow>
    </PanelSection>
  );
}

/**
 * Shared drop-shadow toggle for any selected element. Lock is not a visual
 * effect; it lives in the Layers panel (slide-editor-panel-taxonomy.md).
 */
export function ElementEffectsControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  return (
    <PropRow label="Shadow">
      <input
        type="checkbox"
        checked={element.shadow ?? false}
        onChange={(event) =>
          onUpdateElement(element.id, {
            shadow: event.target.checked ? true : undefined,
          })
        }
        className="h-4 w-4 accent-ds-accent"
        aria-label="Drop shadow"
      />
    </PropRow>
  );
}

/**
 * Shared opacity slider shown for any selected element. Stores `opacity` on the
 * element (cleared to `undefined` at 100% so fully-opaque elements stay clean).
 */
export function ElementOpacityControl({
  element,
  onUpdateElement,
}: {
  element: SlideElement;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const value = element.opacity ?? 1;
  const pct = Math.round(value * 100);
  return (
    <PropRow label="Opacity">
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
        className="min-w-0 flex-1 accent-ds-accent"
        aria-label="Element opacity"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ds-text-muted">
        {pct}%
      </span>
    </PropRow>
  );
}

/**
 * Font picker for text / bullets elements. Stores a stable slide `fontId` in
 * `style.fontId` (cleared to inherit the theme/role font when "Default").
 */
export function FontFamilyControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  return (
    <PropRow label="Font">
      <SelectField
        value={style.fontId ?? ""}
        ariaLabel="Font family"
        onChange={(value) => {
          const next = { ...style };
          if (value) next.fontId = value;
          else delete next.fontId;
          onChange(next);
        }}
        options={FONT_FAMILIES.map((font) => ({
          value: font.value,
          label: font.label,
        }))}
      />
    </PropRow>
  );
}

/** Small icon-button used inside the multi-select tools grid. */
export function ToolBtn({
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
export function ToolRow({
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
  );
}

export function SourceSummary({
  element,
  staleReason,
  onUpdateFromSource,
  onUnlink,
  onRelink,
}: {
  element: SlideElement | null | undefined;
  staleReason?: StaleReason;
  onUpdateFromSource?: (elementId: string) => void;
  onUnlink?: (elementId: string) => void;
  onRelink?: (elementId: string) => void;
}) {
  if (!element) {
    return (
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          Select an element to see its document source link.
        </p>
      </PanelSection>
    );
  }
  const ref = (element as { source?: SlideElement["source"] }).source;
  if (!ref) {
    return (
      <PanelSection>
        <p className="text-sm font-medium text-ds-text-primary">Standalone</p>
        <p className="text-xs text-ds-text-muted">
          This element is not linked to a document. Insert content from the
          stage toolbar’s “From document” menu to establish a source link.
        </p>
      </PanelSection>
    );
  }

  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: ref.unlinked === true,
    staleReason,
  });
  const actions = resolveSourcePanelActions(status);

  const statusMeta = {
    unlinked: { label: "Unlinked", tone: "text-ds-text-secondary" },
    source_missing: { label: "Source missing", tone: "text-ds-danger-text" },
    stale: { label: "Stale", tone: "text-ds-warning-text" },
    linked: { label: "Up to date", tone: "text-ds-success-text" },
    standalone: { label: "Standalone", tone: "text-ds-text-secondary" },
  }[status];

  const explanation = {
    unlinked:
      "This link was intentionally unlinked. Relink to track the source block again.",
    source_missing:
      "The linked source block no longer exists in the document. Unlink to keep this element as standalone.",
    stale:
      "The linked source block changed since this element was last synced. Update to pull the latest content.",
    linked: "This element matches its linked source block.",
    standalone: "This element is not linked to a document.",
  }[status];

  const actionClass = `rounded-ds-md border border-ds-border-subtle px-2.5 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`;

  return (
    <PanelSection title="Source">
      <div className="flex flex-col gap-1">
        <span
          className={`text-sm font-semibold ${statusMeta.tone}`}
          data-testid="source-status"
        >
          {statusMeta.label}
        </span>
        <p className="text-xs text-ds-text-muted">{explanation}</p>
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
      <div className="flex flex-wrap gap-2">
        {actions.canUpdate && onUpdateFromSource ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => onUpdateFromSource(element.id)}
          >
            Update from source
          </button>
        ) : null}
        {actions.canUnlink && onUnlink ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => onUnlink(element.id)}
          >
            Unlink
          </button>
        ) : null}
        {actions.canRelink && onRelink ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => onRelink(element.id)}
          >
            Relink
          </button>
        ) : null}
      </div>
    </PanelSection>
  );
}

/**
 * Per-slide color override. The deck-theme preset swatches are the primary
 * interaction; the raw `<input type=color>` is hidden behind a "Custom…"
 * progressive-disclosure toggle so the token-driven theme colors stay
 * front-and-centre. "Theme" clears the override entirely.
 */
export function ColorOverride({
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
