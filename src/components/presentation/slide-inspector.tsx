"use client";

/**
 * Tabbed inspector for the slide editor.
 *
 * Three tabs:
 *  - **Content** — edits the selected free-form element (text, bullets, image,
 *    shape, visual), lists all elements with reorder/delete, and adds new ones.
 *    For legacy slides (no elements yet) it shows the classic title / layout /
 *    bullets fields plus a "Customize layout" action that materializes elements.
 *  - **Style** — per-slide background and accent color overrides.
 *  - **Notes** — speaker notes.
 *
 * Purely presentational: every change is reported through callbacks; the
 * component never mutates the deck.
 */

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Image as ImageIcon,
  Italic,
  List,
  Shapes,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import { useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { VisualPicker } from "@/components/presentation/visual-picker";
import { Tooltip } from "@/components/ui";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type {
  ElementAlign,
  ShapeKind,
  Slide,
  SlideElement,
  SlideLayout,
  TextElementStyle,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
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

const ALIGN_OPTIONS: ElementAlign[] = ["left", "center", "right"];
const SHAPE_OPTIONS: ShapeKind[] = ["rect", "ellipse", "line"];

type Tab = "content" | "style" | "notes";

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

export type AddElementKind = "text" | "bullets" | "image" | "shape";

export interface SlideInspectorProps {
  slide: Slide;
  slideIndex: number;
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
  onAddElement: (kind: AddElementKind) => void;
  onAddVisual: (visualId: string) => void;
  onUpdateElement: (id: string, patch: ElementPatch) => void;
  onRemoveElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  // Style
  onBackgroundChange: (color: string | undefined) => void;
  onAccentChange: (color: string | undefined) => void;
  // Notes
  onNotesChange: (notes: string) => void;
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

function TextStyleControls({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tooltip label="Bold" side="bottom">
          <button
            type="button"
            aria-pressed={style.bold}
            onClick={() => onChange({ ...style, bold: !style.bold })}
            className={`flex h-7 w-7 items-center justify-center rounded-ds-sm border border-ds-border-subtle transition-colors ${
              style.bold
                ? "bg-ds-control text-ds-control-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover"
            } ${FOCUS_RING}`}
          >
            <Bold size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label="Italic" side="bottom">
          <button
            type="button"
            aria-pressed={style.italic}
            onClick={() => onChange({ ...style, italic: !style.italic })}
            className={`flex h-7 w-7 items-center justify-center rounded-ds-sm border border-ds-border-subtle transition-colors ${
              style.italic
                ? "bg-ds-control text-ds-control-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover"
            } ${FOCUS_RING}`}
          >
            <Italic size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        <div className="ml-1 flex items-center overflow-hidden rounded-ds-sm border border-ds-border-subtle">
          {ALIGN_OPTIONS.map((align) => (
            <button
              key={align}
              type="button"
              aria-pressed={style.align === align}
              onClick={() => onChange({ ...style, align })}
              className={`px-2 py-1 text-xs capitalize transition-colors ${
                style.align === align
                  ? "bg-ds-control text-ds-control-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover"
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={LABEL_CLASS}>Font size ({style.fontSize}%)</span>
        <input
          type="range"
          min={2}
          max={20}
          step={0.5}
          value={style.fontSize}
          onChange={(event) =>
            onChange({ ...style, fontSize: Number(event.target.value) })
          }
          className="w-full"
        />
      </label>

      <label className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS + " mb-0"}>Color</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.color ?? "#ffffff"}
            onChange={(event) =>
              onChange({ ...style, color: event.target.value })
            }
            className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
            aria-label="Text color"
          />
          {style.color !== undefined ? (
            <button
              type="button"
              onClick={() => {
                const next = { ...style };
                delete next.color;
                onChange(next);
              }}
              className={`text-xs text-ds-text-muted underline hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              Theme
            </button>
          ) : null}
        </div>
      </label>
    </div>
  );
}

function ElementEditor({
  element,
  visuals,
  onUpdateElement,
}: {
  element: SlideElement;
  visuals: ReadonlyMap<string, Visual>;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  switch (element.kind) {
    case "text":
      return (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={LABEL_CLASS}>Text</span>
            <textarea
              value={element.text}
              onChange={(event) =>
                onUpdateElement(element.id, { text: event.target.value })
              }
              rows={3}
              className={`${FIELD_CLASS} resize-y ${FOCUS_RING}`}
            />
          </label>
          <TextStyleControls
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
        </div>
      );
    case "bullets":
      return (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={LABEL_CLASS}>Bullets (one per line)</span>
            <textarea
              value={element.bullets.join("\n")}
              onChange={(event) =>
                onUpdateElement(element.id, {
                  bullets: event.target.value
                    .split("\n")
                    .map((line) => line.replace(/\s+$/, ""))
                    .filter((line) => line.length > 0),
                })
              }
              rows={5}
              className={`${FIELD_CLASS} resize-y ${FOCUS_RING}`}
            />
          </label>
          <TextStyleControls
            style={element.style}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
        </div>
      );
    case "image":
      return (
        <div className="flex flex-col gap-3">
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
        </div>
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

export function SlideInspector({
  slide,
  slideIndex,
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
  onAddElement,
  onAddVisual,
  onUpdateElement,
  onRemoveElement,
  onBringToFront,
  onSendToBack,
  onBackgroundChange,
  onAccentChange,
  onNotesChange,
}: SlideInspectorProps) {
  const [tab, setTab] = useState<Tab>("content");
  const [visualPickerOpen, setVisualPickerOpen] = useState(false);

  const elements = slide.elements ?? [];
  const hasElements = elements.length > 0;
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  const orderedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ds-border-subtle">
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
        <TabButton
          active={tab === "notes"}
          label="Notes"
          onClick={() => setTab("notes")}
        />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {tab === "content" ? (
          hasElements ? (
            <>
              {/* Add elements */}
              <div className="flex flex-wrap items-center gap-1.5">
                <AddButton
                  icon={<Type size={13} aria-hidden="true" />}
                  label="Text"
                  onClick={() => onAddElement("text")}
                />
                <AddButton
                  icon={<List size={13} aria-hidden="true" />}
                  label="Bullets"
                  onClick={() => onAddElement("bullets")}
                />
                <AddButton
                  icon={<ImageIcon size={13} aria-hidden="true" />}
                  label="Image"
                  onClick={() => onAddElement("image")}
                />
                <AddButton
                  icon={<Shapes size={13} aria-hidden="true" />}
                  label="Shape"
                  onClick={() => onAddElement("shape")}
                />
                <AddButton
                  icon={<Sparkles size={13} aria-hidden="true" />}
                  label="Visual"
                  aria-haspopup="dialog"
                  aria-expanded={visualPickerOpen}
                  onClick={() => setVisualPickerOpen((open) => !open)}
                />
              </div>

              {visualPickerOpen ? (
                <VisualPicker
                  className="w-full"
                  visuals={visuals}
                  onPick={(visualId) => {
                    onAddVisual(visualId);
                    setVisualPickerOpen(false);
                  }}
                  onClose={() => setVisualPickerOpen(false)}
                />
              ) : null}

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
                  <ElementEditor
                    element={selectedElement}
                    visuals={visuals}
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
              fallback="#000000"
              onChange={onBackgroundChange}
            />
            <ColorOverride
              label="Accent"
              value={slide.accent}
              fallback="#818cf8"
              onChange={onAccentChange}
            />
            <p className="text-xs text-ds-text-muted">
              Overrides apply to this slide only. Use “Theme” to fall back to
              the deck theme.
            </p>
          </div>
        ) : null}

        {tab === "notes" ? (
          <label className="block">
            <span className={LABEL_CLASS}>Speaker notes</span>
            <p className="mb-1.5 text-xs text-ds-text-muted">
              Tip: add a{" "}
              <code className="rounded bg-ds-surface px-1 font-mono text-ds-text-secondary">
                &gt; blockquote
              </code>{" "}
              in the document for speaker notes.
            </p>
            <textarea
              value={slide.notes}
              onChange={(event) => onNotesChange(event.target.value)}
              rows={6}
              className={`${FIELD_CLASS} resize-y ${FOCUS_RING}`}
            />
          </label>
        ) : null}
      </div>
    </aside>
  );
}

function AddButton({
  icon,
  label,
  onClick,
  ...rest
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
} & Omit<React.ComponentPropsWithoutRef<"button">, "onClick" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
      {...rest}
    >
      {icon}
      {label}
    </button>
  );
}

function ColorOverride({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (color: string | undefined) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-ds-text-secondary">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? fallback}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
          aria-label={`${label} color`}
        />
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
    </label>
  );
}
