"use client";

import { Bold, Italic, Link2Off, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SlideInspectorProps } from "./types";
import {
  FIELD_CLASS,
  FitModeControl,
  FONT_FAMILIES,
  LABEL_CLASS,
  LineHeightControl,
  NumberField,
  ParagraphSpacingControl,
  VerticalAlignControl,
} from "./primitives";
import { ColorPicker, Dialog, Tooltip } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import { assertNever } from "@/lib/assert-never";
import type {
  ConnectorArrow,
  ConnectorElement,
  ConnectorEndpoint,
  Deck,
  ImageCrop,
  ImageElement,
  ImageFitMode,
  ImageMaskShape,
  ShapeKind,
  SlideElement,
  TextElementStyle,
  TextRun,
} from "@/lib/presentation/deck";
import { detachConnectorEndpoint } from "@/lib/presentation/connector-lifecycle";
import { useCoalesceSession } from "@/lib/presentation/gesture-primitives";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";
import {
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
} from "@/lib/presentation/rich-text-html";
import {
  applyBoldOrItalic,
  applyForeColor,
} from "@/lib/presentation/rich-text-commands";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import type { Visual } from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { applyTheme, isThemeActive } from "@/lib/visual/transforms";

const SHAPE_OPTIONS: ShapeKind[] = ["rect", "ellipse", "line", "triangle"];

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
  const [textColor, setTextColor] = useState("#000000");
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
  }, [coalesceKeyRef, onChange]);

  const applyCommand = useCallback(
    (command: "bold" | "italic" | "foreColor", value?: string) => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      if (command === "foreColor" && value !== undefined) {
        applyForeColor(value, node);
      } else if (command === "bold" || command === "italic") {
        applyBoldOrItalic(command, node);
      }
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
        <ColorPicker
          color={textColor}
          onChange={(hex) => {
            setTextColor(hex);
            applyCommand("foreColor", hex);
          }}
          aria-label="Selected text color"
        />
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

  const { handleFile } = useImageUpload({
    deck,
    currentSrc: element.src,
    onAccept: (src, assetId) => {
      setError(null);
      onUpdateElement(element.id, { src, ...(assetId ? { assetId } : {}) });
    },
    onError: (message) => setError(message),
    documentId,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
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

export function ImageCropControl({
  crop,
  onChange,
}: {
  crop: ImageCrop | undefined;
  onChange: (crop: ImageCrop | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
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
    <>
      <div className="flex items-center justify-between">
        <span className={LABEL_CLASS + " mb-0"}>Crop</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`text-xs text-ds-text-muted underline hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          {crop ? "Edit crop…" : "Set crop…"}
        </button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="image-crop-dialog-label"
        className="max-w-sm"
      >
        <div className="flex items-center justify-between">
          <h2
            id="image-crop-dialog-label"
            className="text-base font-semibold text-ds-text-primary"
          >
            Crop
          </h2>
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
        <div className="mt-4 grid grid-cols-2 gap-2">
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
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center justify-center rounded-full bg-ds-accent px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
          >
            Done
          </button>
        </div>
      </Dialog>
    </>
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
                  <ColorPicker
                    color={element.stroke?.color ?? "#000000"}
                    onChange={(hex) =>
                      onUpdateElement(element.id, {
                        stroke: {
                          color: hex,
                          width: element.stroke?.width ?? 0.4,
                        },
                      })
                    }
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

      {/* Routing */}
      <label className="block">
        <span className={LABEL_CLASS}>Routing</span>
        <select
          value={element.routing ?? "straight"}
          onChange={(event) =>
            onUpdateElement(element.id, {
              routing: event.target.value as "straight" | "elbow",
            })
          }
          className={`${FIELD_CLASS} ${FOCUS_RING}`}
          aria-label="Connector routing"
        >
          <option value="straight">Straight</option>
          <option value="elbow">Elbow</option>
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
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS + " mb-0"}>Stroke color</span>
        <ColorPicker
          color={element.stroke?.color ?? "#a1a1aa"}
          onChange={(hex) =>
            onUpdateElement(element.id, {
              stroke: {
                color: hex,
                width: element.stroke?.width ?? 0.4,
              },
            })
          }
          aria-label="Stroke color"
        />
      </div>

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
export function VisualElementEditor({
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
  const visualOptions = [...visuals.entries()];

  return (
    <div className="flex flex-col gap-3">
      <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-base">
        <VisualRenderer
          visual={preview}
          className="h-full w-full object-contain"
          transparentBackground
        />
      </span>

      {visualOptions.length > 1 ? (
        <label className="block">
          <span className={LABEL_CLASS}>Replace</span>
          <select
            value={element.visualId}
            aria-label="Replace visual from document"
            onChange={(event) =>
              onUpdateElement(element.id, { visualId: event.target.value })
            }
            className={`${FIELD_CLASS} ${FOCUS_RING}`}
          >
            {visualOptions.map(([id, candidate]) => (
              <option key={id} value={id}>
                {candidate.title?.trim() || `${candidate.type} visual`}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
    <label className="block">
      <span className={LABEL_CLASS}>Font</span>
      <select
        value={style.fontId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          const next = { ...style };
          if (value) next.fontId = value;
          else delete next.fontId;
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
