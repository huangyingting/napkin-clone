"use client";

/**
 * Tabbed inspector for the slide editor.
 *
 * Two tabs:
 *  - **Content** — edits the selected free-form element (text, bullets, image,
 *    shape, visual), lists all elements with reorder/delete, and adds new ones.
 *    For legacy slides (no elements yet) it shows the classic title / layout /
 *    bullets fields plus a "Customize layout" action that materializes elements.
 *  - **Style** — per-slide background and accent color overrides.
 *
 * Speaker notes live in a dedicated panel docked at the bottom of the stage
 * (see `SlideNotesPanel` in the editor), not here.
 *
 * Purely presentational: every change is reported through callbacks; the
 * component never mutates the deck.
 */

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Italic,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { DECK_THEMES } from "@/components/presentation/slide-canvas";
import { TextStyleBar } from "@/components/presentation/text-style-bar";
import { Swatch, Tooltip } from "@/components/ui";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type {
  Deck,
  ImageElement,
  ShapeKind,
  Slide,
  SlideElement,
  SlideLayout,
  TextElementStyle,
  TextRun,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import {
  canAddImage,
  dataUrlByteSize,
  isEmptyImageSrc,
  validateImageFile,
} from "@/lib/presentation/image-element";
import {
  bulletsToRuns,
  mergeRuns,
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
  splitRunsIntoLines,
} from "@/lib/presentation/rich-text-html";
import { themeSwatchColors } from "@/lib/presentation/text-style";
import type { Visual } from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { applyTheme, isThemeActive } from "@/lib/visual/transforms";

const LAYOUT_OPTIONS: SlideLayout[] = [
  "title",
  "section",
  "content",
  "media",
  "blank",
];

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

type Tab = "content" | "style";

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

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
  // Legacy slide editing
  onTitleChange: (title: string) => void;
  onLayoutChange: (layout: SlideLayout) => void;
  onBulletsChange: (value: string) => void;
  onMaterialize: () => void;
  // Element editing
  onUpdateElement: (id: string, patch: ElementPatch) => void;
  onRemoveElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  // Style
  onBackgroundChange: (color: string | undefined) => void;
  onBackgroundGradientChange: (
    gradient: { from: string; to: string; angle?: number } | undefined,
  ) => void;
  onBackgroundImageChange: (image: string | undefined) => void;
  onAccentChange: (color: string | undefined) => void;
  /**
   * Overrides the root container classes so the host can place the inspector in
   * the desktop side pane or a mobile bottom sheet (issue #209). Defaults to the
   * desktop three-pane column.
   */
  className?: string;
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-ds-sm px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-ds-control text-ds-control-text"
          : "text-ds-text-secondary hover:bg-ds-state-hover"
      } ${FOCUS_RING}`}
    >
      {label}
    </button>
  );
}

function elementLabel(element: SlideElement): string {
  switch (element.kind) {
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
    default:
      return "Element";
  }
}

function RichTextBox({
  label,
  html,
  onChange,
}: {
  label: string;
  html: string;
  onChange: (value: { text: string; runs: TextRun[] }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef("");

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
    onChange(serialized);
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
        onBlur={emitChange}
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
 */
function ImageElementEditor({
  element,
  deck,
  onUpdateElement,
}: {
  element: ImageElement;
  deck: Deck;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        return;
      }
      // Net change in inlined bytes: replacing this element's current image
      // only costs the difference, so a like-for-like swap is never rejected.
      const addedBytes = dataUrlByteSize(result) - dataUrlByteSize(element.src);
      const budget = canAddImage(deck, addedBytes);
      // Only block genuine growth past the budget; a non-increasing change
      // (shrinking or replacing) always passes, so decks already over budget
      // stay editable.
      if (addedBytes > 0 && !budget.ok) {
        const usedMb = (budget.totalBytes / (1024 * 1024)).toFixed(1);
        setError(
          `Deck image storage is full (${usedMb} MB). Remove an image or use a smaller file.`,
        );
        return;
      }
      onUpdateElement(element.id, { src: result });
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

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
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS + " mb-0"}>Fit</span>
        <div role="radiogroup" aria-label="Image fit" className="flex gap-0.5">
          {(["contain", "cover"] as const).map((fit) => {
            const active = (element.fit ?? "contain") === fit;
            return (
              <button
                key={fit}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onUpdateElement(element.id, { fit })}
                className={`rounded-ds-sm px-2 py-1 text-xs font-medium capitalize transition-colors ${
                  active
                    ? "bg-ds-control text-ds-control-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                {fit}
              </button>
            );
          })}
        </div>
      </div>
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
          className="w-full accent-ds-control"
          aria-label="Image corner radius"
        />
      </label>
    </div>
  );
}

function ElementEditor({
  element,
  deck,
  visuals,
  textColorPresets,
  onUpdateElement,
}: {
  element: SlideElement;
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  textColorPresets: readonly string[];
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  switch (element.kind) {
    case "text":
      return (
        <div className="flex flex-col gap-3">
          <RichTextBox
            label="Text"
            html={runsToHtml(element.runs, element.text)}
            onChange={({ text, runs }) =>
              onUpdateElement(element.id, {
                text,
                runs: shouldStoreRuns(runs) ? runs : undefined,
              })
            }
          />
          <TextStyleBar
            variant="labeled"
            style={element.style}
            colorPresets={textColorPresets}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <FontFamilyControl
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
            onChange={({ runs }) => {
              const lines = splitRunsIntoLines(runs)
                .map((line) => ({
                  text: line.text.replace(/\s+$/, ""),
                  runs: mergeRuns(line.runs),
                }))
                .filter((line) => line.text.length > 0);
              const hasRichBullets = lines.some((line) =>
                shouldStoreRuns(line.runs),
              );
              onUpdateElement(element.id, {
                bullets: lines.map((line) => line.text),
                bulletRuns: hasRichBullets
                  ? lines.map((line) => line.runs)
                  : undefined,
              });
            }}
          />
          <TextStyleBar
            variant="labeled"
            style={element.style}
            colorPresets={textColorPresets}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <FontFamilyControl
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
        </div>
      );
    case "image":
      return (
        <ImageElementEditor
          element={element}
          deck={deck}
          onUpdateElement={onUpdateElement}
        />
      );
    case "shape":
      return (
        <div className="flex flex-col gap-3">
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
          <label className="flex items-center justify-between gap-2">
            <span className={LABEL_CLASS + " mb-0"}>Color</span>
            <input
              type="color"
              value={element.color}
              onChange={(event) =>
                onUpdateElement(element.id, { color: event.target.value })
              }
              className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
              aria-label="Shape color"
            />
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
                  value={element.stroke?.width ?? (element.shape === "line" ? 0.4 : 0)}
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
                  className="w-24 accent-ds-control"
                  aria-label={
                    element.shape === "line" ? "Line thickness" : "Border width"
                  }
                />
              </span>
            </label>
          ) : null}
          {element.shape === "rect" ? (
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
                className="w-full accent-ds-control"
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
    default:
      return null;
  }
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
                ? "border-ds-control bg-ds-control text-ds-control-text"
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

function ElementActionRow({
  elementId,
  onDuplicateElement,
  onBringToFront,
  onSendToBack,
  onRemoveElement,
}: {
  elementId: string;
  onDuplicateElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onRemoveElement: (id: string) => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-4 gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1">
      <Tooltip label="Duplicate element" side="bottom">
        <button
          type="button"
          onClick={() => onDuplicateElement(elementId)}
          aria-label="Duplicate element"
          className={`flex h-7 items-center justify-center rounded-ds-sm text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <Copy size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Bring to front" side="bottom">
        <button
          type="button"
          onClick={() => onBringToFront(elementId)}
          aria-label="Bring to front"
          className={`flex h-7 items-center justify-center rounded-ds-sm text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <ArrowUpToLine size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Send to back" side="bottom">
        <button
          type="button"
          onClick={() => onSendToBack(elementId)}
          aria-label="Send to back"
          className={`flex h-7 items-center justify-center rounded-ds-sm text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <ArrowDownToLine size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Delete element" side="bottom">
        <button
          type="button"
          onClick={() => onRemoveElement(elementId)}
          aria-label="Delete element"
          className={`flex h-7 items-center justify-center rounded-ds-sm text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </Tooltip>
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
          className="accent-ds-control"
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
          className="accent-ds-control"
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
        className="w-full accent-ds-control"
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

export function SlideInspector({
  slide,
  slideIndex,
  deck,
  visuals,
  selectedElementId,
  onSelectElement,
  canDelete,
  onDuplicateSlide,
  onRemoveSlide,
  onTitleChange,
  onLayoutChange,
  onBulletsChange,
  onMaterialize,
  onUpdateElement,
  onRemoveElement,
  onDuplicateElement,
  onBringToFront,
  onSendToBack,
  onBackgroundChange,
  onBackgroundGradientChange,
  onBackgroundImageChange,
  onAccentChange,
  className = "flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ds-border-subtle",
}: SlideInspectorProps) {
  const [tab, setTab] = useState<Tab>("content");

  const elements = slide.elements ?? [];
  const hasElements = elements.length > 0;
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  const orderedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const themeConfig = DECK_THEMES[slide.theme] ?? DECK_THEMES.default;
  const textColorPresets = [
    themeConfig.titleColor,
    themeConfig.bodyColor,
    themeConfig.mutedColor,
    themeConfig.accentColor,
    "#ffffff",
    "#000000",
  ];

  return (
    <aside className={className}>
      <div className="flex items-center justify-between border-b border-ds-border-subtle px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-muted">
          Slide {slideIndex + 1}
        </p>
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
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-ds-border-subtle px-3 py-2">
        <TabButton
          active={tab === "content"}
          label="Content"
          onClick={() => setTab("content")}
        />
        <TabButton
          active={tab === "style"}
          label="Style"
          onClick={() => setTab("style")}
        />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {tab === "content" ? (
          hasElements ? (
            <>
              {/* Element list */}
              <div className="flex flex-col gap-1">
                {orderedElements.map((element) => {
                  const selected = element.id === selectedElementId;
                  return (
                    <div
                      key={element.id}
                      className={`flex items-center gap-1 rounded-ds-sm border px-2 py-1 ${
                        selected
                          ? "border-ds-control bg-ds-state-hover"
                          : "border-transparent hover:bg-ds-state-hover"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectElement(element.id)}
                        className={`min-w-0 flex-1 truncate text-left text-xs text-ds-text-secondary ${FOCUS_RING}`}
                      >
                        {elementLabel(element)}
                      </button>
                      <Tooltip label="Duplicate element" side="bottom">
                        <button
                          type="button"
                          onClick={() => onDuplicateElement(element.id)}
                          aria-label="Duplicate element"
                          className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
                        >
                          <Copy size={12} aria-hidden="true" />
                        </button>
                      </Tooltip>
                      <Tooltip label="Bring to front" side="bottom">
                        <button
                          type="button"
                          onClick={() => onBringToFront(element.id)}
                          aria-label="Bring to front"
                          className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
                        >
                          <ArrowUpToLine size={12} aria-hidden="true" />
                        </button>
                      </Tooltip>
                      <Tooltip label="Send to back" side="bottom">
                        <button
                          type="button"
                          onClick={() => onSendToBack(element.id)}
                          aria-label="Send to back"
                          className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
                        >
                          <ArrowDownToLine size={12} aria-hidden="true" />
                        </button>
                      </Tooltip>
                      <Tooltip label="Delete element" side="bottom">
                        <button
                          type="button"
                          onClick={() => onRemoveElement(element.id)}
                          aria-label="Delete element"
                          className={`flex h-6 w-6 items-center justify-center rounded-ds-sm text-ds-text-muted hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>

              {/* Selected element editor */}
              {selectedElement ? (
                <div className="border-t border-ds-border-subtle pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ds-text-muted">
                    {elementLabel(selectedElement)}
                  </p>
                  <ElementActionRow
                    elementId={selectedElement.id}
                    onDuplicateElement={onDuplicateElement}
                    onBringToFront={onBringToFront}
                    onSendToBack={onSendToBack}
                    onRemoveElement={onRemoveElement}
                  />
                  <ElementEditor
                    element={selectedElement}
                    deck={deck}
                    visuals={visuals}
                    textColorPresets={textColorPresets}
                    onUpdateElement={onUpdateElement}
                  />
                  <ElementArrangeControl
                    element={selectedElement}
                    onUpdateElement={onUpdateElement}
                  />
                  <ElementOpacityControl
                    element={selectedElement}
                    onUpdateElement={onUpdateElement}
                  />
                  <ElementEffectsControl
                    element={selectedElement}
                    onUpdateElement={onUpdateElement}
                  />
                </div>
              ) : (
                <p className="text-xs text-ds-text-muted">
                  Select an element on the slide to edit it.
                </p>
              )}
            </>
          ) : (
            <>
              <label className="block">
                <span className={LABEL_CLASS}>Title</span>
                <input
                  type="text"
                  value={slide.title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="Untitled slide"
                  className={`${FIELD_CLASS} ${FOCUS_RING}`}
                />
              </label>

              <label className="block">
                <span className={LABEL_CLASS}>Layout</span>
                <select
                  value={slide.layout}
                  onChange={(event) =>
                    onLayoutChange(event.target.value as SlideLayout)
                  }
                  className={`${FIELD_CLASS} ${FOCUS_RING}`}
                >
                  {LAYOUT_OPTIONS.map((layout) => (
                    <option key={layout} value={layout}>
                      {layout}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={LABEL_CLASS}>Bullets (one per line)</span>
                <textarea
                  value={slide.bullets.join("\n")}
                  onChange={(event) => onBulletsChange(event.target.value)}
                  rows={5}
                  className={`${FIELD_CLASS} resize-y ${FOCUS_RING}`}
                />
              </label>

              <button
                type="button"
                onClick={onMaterialize}
                className={`flex w-full items-center justify-center gap-1.5 rounded-ds-md bg-ds-control px-3 py-2 text-sm font-medium text-ds-control-text transition-colors hover:bg-ds-control-hover ${FOCUS_RING}`}
              >
                Customize layout (free-form)
              </button>
              <p className="text-xs text-ds-text-muted">
                Unlocks drag-and-drop text, images, and shapes on this slide.
              </p>
            </>
          )
        ) : null}

        {tab === "style" ? (
          <div className="flex flex-col gap-4">
            <ColorOverride
              label="Background"
              value={slide.background}
              fallback={themeConfig.bgColor}
              presets={THEME_BACKGROUND_SWATCHES}
              onChange={onBackgroundChange}
            />
            <ColorOverride
              label="Accent"
              value={slide.accent}
              fallback={themeConfig.accentColor}
              presets={THEME_ACCENT_SWATCHES}
              onChange={onAccentChange}
            />
            <div className="border-t border-ds-border-subtle pt-3">
              <span className={`${LABEL_CLASS} flex items-center justify-between`}>
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
                  className="accent-ds-control"
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
                    className="flex-1 accent-ds-control"
                    aria-label="Gradient angle"
                  />
                </div>
              ) : null}
            </div>
            <label className="block">
              <span className={LABEL_CLASS}>Background image URL</span>
              <input
                type="text"
                value={slide.backgroundImage ?? ""}
                onChange={(event) =>
                  onBackgroundImageChange(
                    event.target.value.trim() === ""
                      ? undefined
                      : event.target.value.trim(),
                  )
                }
                placeholder="https://… or data:image/…"
                className={`${FIELD_CLASS} ${FOCUS_RING}`}
              />
            </label>
            <p className="text-xs text-ds-text-muted">
              Overrides apply to this slide only. Image &gt; gradient &gt; solid
              color. “Theme” clears the color override.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
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
