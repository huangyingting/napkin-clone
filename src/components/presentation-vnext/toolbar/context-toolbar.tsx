"use client";

/**
 * Context / Popover Toolbar — floats above the selection bounding box.
 *
 * Frequent controls dispatch through the v7 editor command path via callbacks
 * owned by the editor shell. Inline text commands still go through the custom
 * DOM event consumed by `InlineTextEditorVNext`.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Copy,
  Crop,
  Ellipsis,
  Group,
  EyeOff,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Lock,
  Plus,
  Replace,
  RotateCcw,
  RotateCw,
  SendToBack,
  Strikethrough,
  Trash2,
  Underline,
  Ungroup,
  Unlock,
} from "lucide-react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import type {
  ImageFitMode,
  StylePatch,
} from "@/lib/presentation-vnext/style-schema";
import { ColorPicker } from "@/components/ui/color-picker";
import { FloatingSurface } from "@/components/ui/floating-surface";
import { Popover } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cx, FOCUS_RING } from "@/components/ui/tokens";
import { dispatchInlineTextCommand } from "@/lib/presentation-vnext/inline-text-commands";

const TOOLBAR_GAP = 12;
const EDGE_INSET = 8;

export type SelectionAlignMode =
  "left" | "center" | "right" | "top" | "middle" | "bottom";
export type SelectionDistributeMode = "horizontal" | "vertical";
export type SelectionMatchSizeMode = "width" | "height" | "both";

type TableNode = Extract<SlideChildNode, { type: "table" }>;

interface TBtnProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function TBtn({ label, active, disabled, onClick, children }: TBtnProps) {
  return (
    <Tooltip label={label} delay={250}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          "flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-sm,6px)] text-ds-text-secondary transition-colors",
          "hover:bg-ds-state-hover hover:text-ds-text-primary",
          "disabled:pointer-events-none disabled:opacity-40",
          active && "bg-ds-accent-surface text-ds-accent-text",
          FOCUS_RING,
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <div aria-hidden className="mx-1 h-4 w-px bg-ds-border-subtle" />;
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ColorPicker
      color={value}
      onChange={onChange}
      aria-label={label}
      size="sm"
      triggerChrome="swatch"
      layer="tooltip"
      preserveSelection
    />
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  children,
  width = "w-20",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-ds-text-muted">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        title={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cx(
          "h-7 rounded-[var(--ds-radius-sm,6px)] border border-ds-border-subtle bg-ds-surface px-1.5 text-[11px] text-ds-text-secondary outline-none",
          width,
          FOCUS_RING,
        )}
      >
        {children}
      </select>
    </label>
  );
}

function ToolbarNumber({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      className={cx(
        "h-7 w-14 rounded-[var(--ds-radius-sm,6px)] border border-ds-border-subtle bg-ds-surface px-1.5 text-[11px] text-ds-text-secondary outline-none",
        FOCUS_RING,
      )}
    />
  );
}

function getColor(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function getSolidFillColor(
  localStyle: StylePatch | undefined,
  fallback: string,
): string {
  const fill = localStyle?.fill;
  return fill?.type === "solid" ? getColor(fill.color, fallback) : fallback;
}

function getSelectionRect(selectedIds: string[]): DOMRect | null {
  if (typeof document === "undefined" || selectedIds.length === 0) return null;
  const rects: DOMRect[] = [];
  for (const id of selectedIds) {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    if (el) rects.push(el.getBoundingClientRect());
  }
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function getSlideAnchorRect(): DOMRect | null {
  if (typeof document === "undefined") return null;
  const frame = document.querySelector('[data-slide-stage-frame="true"]');
  return frame?.getBoundingClientRect() ?? null;
}

function tableWithAddedRow(node: TableNode) {
  return {
    rows: [
      ...node.content.rows,
      {
        id: `${node.id}-row-${node.content.rows.length + 1}`,
        cells: node.content.columns.map(() => ({ text: "" })),
      },
    ],
  };
}

function tableWithAddedColumn(node: TableNode) {
  const nextIndex = node.content.columns.length + 1;
  return {
    columns: [
      ...node.content.columns,
      { id: `${node.id}-col-${nextIndex}`, label: `Column ${nextIndex}` },
    ],
    rows: node.content.rows.map((row) => ({
      ...row,
      cells: [...row.cells, { text: "" }],
    })),
  };
}

function tableWithDeletedLastRow(node: TableNode) {
  return {
    rows:
      node.content.rows.length > 1
        ? node.content.rows.slice(0, -1)
        : node.content.rows,
  };
}

function tableWithDeletedLastColumn(node: TableNode) {
  return node.content.columns.length > 1
    ? {
        columns: node.content.columns.slice(0, -1),
        rows: node.content.rows.map((row) => ({
          ...row,
          cells: row.cells.slice(0, -1),
        })),
      }
    : { columns: node.content.columns, rows: node.content.rows };
}

export interface ContextToolbarProps {
  selectedIds: string[];
  selectedNode: SlideChildNode | undefined;
  isInlineEditing: boolean;
  isDragging: boolean;
  isDecorationSelected: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onAlignSelection?: (mode: SelectionAlignMode) => void;
  onDistributeSelection?: (mode: SelectionDistributeMode) => void;
  onMatchSize?: (mode: SelectionMatchSizeMode) => void;
  onUpdateSelectedContent?: (patch: Record<string, unknown>) => void;
  onUpdateSelectedLayout?: (patch: { rotation?: number }) => void;
  onUpdateSelectedLocalStyle?: (patch: StylePatch) => void;
  onUpdateSelectedAttributes?: (patch: {
    locked?: boolean;
    hidden?: boolean;
  }) => void;
  onReplaceImage?: () => void;
  onReplaceVisual?: () => void;
  onResetImageCrop?: () => void;
  onEnterTableEdit?: () => void;
  slideBackgroundColor?: string;
  onUpdateSlideLocalStyle?: (patch: StylePatch) => void;
  onInsertSlide?: () => void;
  onDuplicateSlide?: () => void;
  onDeleteSlide?: () => void;
  onDetachDecoration?: () => void;
  onRequestStageFocus?: () => void;
}

export function restoreFocusAfterContextToolbarEscape(
  onRequestStageFocus: (() => void) | undefined,
): void {
  if (onRequestStageFocus) {
    onRequestStageFocus();
    return;
  }
  if (typeof document === "undefined") return;
  (document.activeElement as HTMLElement | null)?.blur();
}

export function ContextToolbar({
  selectedIds,
  selectedNode,
  isInlineEditing,
  isDragging,
  isDecorationSelected,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onAlignSelection,
  onDistributeSelection,
  onMatchSize,
  onUpdateSelectedContent,
  onUpdateSelectedLayout,
  onUpdateSelectedLocalStyle,
  onUpdateSelectedAttributes,
  onReplaceImage,
  onReplaceVisual,
  onResetImageCrop,
  onEnterTableEdit,
  slideBackgroundColor = "#ffffff",
  onUpdateSlideLocalStyle,
  onInsertSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onDetachDecoration,
  onRequestStageFocus,
}: ContextToolbarProps): JSX.Element | null {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: -1000, left: -1000 });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("https://");
  const [moreOpen, setMoreOpen] = useState(false);
  const prevPositionRef = useRef({ top: -1000, left: -1000 });
  const isMultiSelect = selectedIds.length > 1;
  const showSlideTools =
    selectedIds.length === 0 &&
    !isInlineEditing &&
    Boolean(onUpdateSlideLocalStyle || onInsertSlide);
  const visible = !isDragging && (selectedIds.length > 0 || showSlideTools);

  function updateToolbarPosition() {
    if (!visible) return;
    const targetRect = getSelectionRect(selectedIds) ?? getSlideAnchorRect();
    if (!targetRect) return;
    const toolbarEl = toolbarRef.current;
    const toolbarWidth = toolbarEl?.offsetWidth ?? 320;
    const toolbarHeight = toolbarEl?.offsetHeight ?? 36;
    const left = Math.max(
      EDGE_INSET,
      targetRect.left + targetRect.width / 2 - toolbarWidth / 2,
    );
    const top = showSlideTools
      ? targetRect.top + TOOLBAR_GAP
      : targetRect.top - TOOLBAR_GAP - toolbarHeight;
    if (
      prevPositionRef.current.top !== top ||
      prevPositionRef.current.left !== left
    ) {
      prevPositionRef.current = { top, left };
      setPosition({ top, left });
    }
  }

  useLayoutEffect(() => {
    updateToolbarPosition();
    // updateToolbarPosition intentionally reads live DOM geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedIds, showSlideTools]);

  useEffect(() => {
    if (!visible) return;
    const handler = () => updateToolbarPosition();
    window.addEventListener("resize", handler, { passive: true });
    window.addEventListener("scroll", handler, {
      passive: true,
      capture: true,
    });
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
    // updateToolbarPosition intentionally reads live DOM geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedIds, showSlideTools]);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const tick = () => {
      updateToolbarPosition();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
    // updateToolbarPosition intentionally reads live DOM geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedIds, showSlideTools]);

  const nodeType = selectedNode?.type;
  const showTextGroup =
    isInlineEditing ||
    nodeType === "text" ||
    (nodeType === "shape" && !isMultiSelect);
  const showArrangeGroup = !isInlineEditing && !isDecorationSelected;

  const textStyle = selectedNode?.localStyle?.text;
  const fillColor = getSolidFillColor(selectedNode?.localStyle, "#ffffff");
  const strokeColor = getColor(
    selectedNode?.localStyle?.stroke?.color,
    "#111827",
  );
  const textColor = getColor(textStyle?.color, "#111827");
  const fontSize = textStyle?.fontSizePt ?? 18;
  const opacity = selectedNode?.localStyle?.opacity ?? 1;
  const rotation = selectedNode?.layout?.rotation ?? 0;

  function runTextCommand(command: "bold" | "italic" | "underline") {
    dispatchInlineTextCommand({ command });
    if (isInlineEditing) return;
    if (command === "bold") {
      onUpdateSelectedLocalStyle?.({
        text: { weight: textStyle?.weight === 700 ? 400 : 700 },
      });
    } else if (command === "italic") {
      onUpdateSelectedLocalStyle?.({ text: { italic: !textStyle?.italic } });
    } else {
      onUpdateSelectedLocalStyle?.({
        text: { underline: !textStyle?.underline },
      });
    }
  }

  function updateTextColor(value: string) {
    dispatchInlineTextCommand({ command: "color", value });
    if (!isInlineEditing)
      onUpdateSelectedLocalStyle?.({ text: { color: value } });
  }

  function updateTextAlign(align: "left" | "center" | "right") {
    dispatchInlineTextCommand({ command: `align-${align}` });
    if (!isInlineEditing) onUpdateSelectedLocalStyle?.({ text: { align } });
  }

  function updateFontSize(value: number) {
    dispatchInlineTextCommand({
      command: "font-size",
      value: `${value}pt`,
    });
    if (!isInlineEditing) {
      onUpdateSelectedLocalStyle?.({ text: { fontSizePt: value } });
    }
  }

  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End" &&
      event.key !== "Escape"
    ) {
      return;
    }
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restoreFocusAfterContextToolbarEscape(onRequestStageFocus);
      return;
    }
    const controls = Array.from(
      toolbar.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled):not([type="hidden"])',
      ),
    );
    if (controls.length === 0) return;
    const currentIndex = controls.findIndex(
      (control) => control === document.activeElement,
    );
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? controls.length - 1
          : currentIndex === -1
            ? 0
            : (currentIndex + direction + controls.length) % controls.length;
    controls[nextIndex]?.focus();
    event.preventDefault();
  }

  return (
    <FloatingSurface
      open={visible}
      position={position}
      role="toolbar"
      aria-label="Context toolbar"
      layer="tooltip"
      elevation="overlay"
      closeOnClickAway={false}
      closeOnEscape={false}
      keepSelection
      clampToViewport
      className="flex max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto px-1.5 py-1"
    >
      <div
        ref={toolbarRef}
        className="flex items-center gap-0.5"
        onKeyDown={handleToolbarKeyDown}
      >
        {showSlideTools ? (
          <>
            <ColorInput
              label="Slide background"
              value={slideBackgroundColor}
              onChange={(color) =>
                onUpdateSlideLocalStyle?.({
                  slide: { background: { type: "solid", color } },
                })
              }
            />
            <Divider />
            <TBtn label="Add slide" onClick={() => onInsertSlide?.()}>
              <Plus size={13} aria-hidden />
            </TBtn>
            <TBtn label="Duplicate slide" onClick={() => onDuplicateSlide?.()}>
              <Copy size={13} aria-hidden />
            </TBtn>
            <TBtn label="Delete slide" onClick={() => onDeleteSlide?.()}>
              <Trash2 size={13} aria-hidden />
            </TBtn>
          </>
        ) : null}

        {showTextGroup ? (
          <>
            <TBtn
              label="Bold"
              active={!isInlineEditing && textStyle?.weight === 700}
              onClick={() => runTextCommand("bold")}
            >
              <Bold size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Italic"
              active={!isInlineEditing && textStyle?.italic === true}
              onClick={() => runTextCommand("italic")}
            >
              <Italic size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Underline"
              active={!isInlineEditing && textStyle?.underline === true}
              onClick={() => runTextCommand("underline")}
            >
              <Underline size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Strikethrough"
              onClick={() =>
                dispatchInlineTextCommand({ command: "strikethrough" })
              }
            >
              <Strikethrough size={13} aria-hidden />
            </TBtn>
            <Divider />
            <ToolbarSelect
              label="Text role"
              value={selectedNode?.role ?? "body"}
              onChange={(role) => {
                const fontSizePt =
                  role === "title"
                    ? 34
                    : role === "subtitle"
                      ? 24
                      : role === "quote"
                        ? 26
                        : role === "caption"
                          ? 11
                          : 18;
                onUpdateSelectedLocalStyle?.({ text: { fontSizePt } });
              }}
            >
              <option value="title">H1</option>
              <option value="subtitle">H2</option>
              <option value="body">Body</option>
              <option value="quote">Quote</option>
              <option value="caption">Caption</option>
            </ToolbarSelect>
            <TBtn
              label="Bullet list"
              onClick={() =>
                dispatchInlineTextCommand({ command: "bullet-list" })
              }
            >
              <List size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Numbered list"
              onClick={() =>
                dispatchInlineTextCommand({ command: "numbered-list" })
              }
            >
              <ListOrdered size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Outdent list"
              onClick={() =>
                dispatchInlineTextCommand({ command: "outdent-list" })
              }
            >
              <IndentDecrease size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Indent list"
              onClick={() =>
                dispatchInlineTextCommand({ command: "indent-list" })
              }
            >
              <IndentIncrease size={13} aria-hidden />
            </TBtn>
            <Divider />
            <TBtn label="Align left" onClick={() => updateTextAlign("left")}>
              <AlignLeft size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Align center"
              onClick={() => updateTextAlign("center")}
            >
              <AlignCenter size={13} aria-hidden />
            </TBtn>
            <TBtn label="Align right" onClick={() => updateTextAlign("right")}>
              <AlignRight size={13} aria-hidden />
            </TBtn>
            <ColorInput
              label="Text color"
              value={textColor}
              onChange={updateTextColor}
            />
            <ToolbarNumber
              label="Font size"
              value={fontSize}
              min={4}
              max={160}
              onChange={updateFontSize}
            />
            <Popover
              open={linkOpen}
              onClose={() => setLinkOpen(false)}
              portal
              align="center"
              trigger={
                <TBtn label="Link" onClick={() => setLinkOpen((open) => !open)}>
                  <Link size={13} aria-hidden />
                </TBtn>
              }
              className="w-64 p-2"
              aria-label="Add link"
            >
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const url = linkDraft.trim();
                  if (url) {
                    dispatchInlineTextCommand({ command: "link", value: url });
                    setLinkOpen(false);
                  }
                }}
              >
                <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
                  URL
                  <input
                    value={linkDraft}
                    onChange={(event) =>
                      setLinkDraft(event.currentTarget.value)
                    }
                    className="rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 py-1 text-xs text-ds-text-primary outline-none focus:border-ds-accent focus:ring-2 focus:ring-ds-focus-ring/20"
                  />
                </label>
                <button
                  type="submit"
                  className="self-end rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover"
                >
                  Apply link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dispatchInlineTextCommand({ command: "unlink" });
                    setLinkOpen(false);
                  }}
                  className="self-end rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover"
                >
                  Remove link
                </button>
              </form>
            </Popover>
          </>
        ) : null}

        {!isInlineEditing && selectedNode?.type === "shape" ? (
          <>
            {showTextGroup ? <Divider /> : null}
            <ColorInput
              label="Fill color"
              value={fillColor}
              onChange={(color) =>
                onUpdateSelectedLocalStyle?.({
                  fill: { type: "solid", color },
                })
              }
            />
            <ColorInput
              label="Border color"
              value={strokeColor}
              onChange={(color) =>
                onUpdateSelectedLocalStyle?.({
                  stroke: {
                    color,
                    widthPt: selectedNode.localStyle?.stroke?.widthPt ?? 1,
                  },
                })
              }
            />
            <ToolbarNumber
              label="Opacity"
              value={Math.round(opacity * 100)}
              min={0}
              max={100}
              onChange={(value) =>
                onUpdateSelectedLocalStyle?.({ opacity: value / 100 })
              }
            />
          </>
        ) : null}

        {!isInlineEditing && selectedNode?.type === "image" ? (
          <>
            <TBtn
              label="Replace image"
              onClick={() => onReplaceImage?.()}
              disabled={onReplaceImage === undefined}
            >
              <Replace size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Crop image"
              active={selectedNode.content.crop !== undefined}
              onClick={() => {
                if (selectedNode.content.crop) {
                  onResetImageCrop?.();
                  return;
                }
                onUpdateSelectedContent?.({
                  crop: { top: 8, right: 8, bottom: 8, left: 8 },
                });
              }}
            >
              <Crop size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Reset crop"
              disabled={!selectedNode.content.crop}
              onClick={() =>
                selectedNode.content.crop ? onResetImageCrop?.() : undefined
              }
            >
              <RotateCcw size={13} aria-hidden />
            </TBtn>
            <ToolbarSelect
              label="Image fit"
              value={selectedNode.content.fit ?? "cover"}
              onChange={(fit) =>
                onUpdateSelectedContent?.({ fit: fit as ImageFitMode })
              }
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill</option>
              <option value="none">None</option>
            </ToolbarSelect>
            <ToolbarNumber
              label="Opacity"
              value={Math.round(opacity * 100)}
              min={0}
              max={100}
              onChange={(value) =>
                onUpdateSelectedLocalStyle?.({ opacity: value / 100 })
              }
            />
          </>
        ) : null}

        {!isInlineEditing && selectedNode?.type === "visual" ? (
          <>
            <TBtn
              label="Replace visual"
              onClick={() => onReplaceVisual?.()}
              disabled={onReplaceVisual === undefined}
            >
              <Replace size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Transparent background"
              active={selectedNode.content.transparentBackground === true}
              onClick={() =>
                onUpdateSelectedContent?.({
                  transparentBackground:
                    selectedNode.content.transparentBackground !== true,
                })
              }
            >
              BG
            </TBtn>
            <ToolbarSelect
              label="Visual theme"
              value={selectedNode.localStyle?.visual?.styleThemeId ?? "default"}
              onChange={(styleThemeId) =>
                onUpdateSelectedLocalStyle?.({
                  visual: {
                    ...selectedNode.localStyle?.visual,
                    styleThemeId,
                  },
                })
              }
              width="w-24"
            >
              <option value="default">Default</option>
              <option value="accent">Accent</option>
              <option value="muted">Muted</option>
              <option value="contrast">Contrast</option>
            </ToolbarSelect>
          </>
        ) : null}

        {!isInlineEditing && selectedNode?.type === "connector" ? (
          <>
            <ToolbarSelect
              label="Connector routing"
              value={selectedNode.content.routing ?? "straight"}
              onChange={(routing) =>
                onUpdateSelectedContent?.({
                  routing: routing as "straight" | "elbow" | "curved",
                })
              }
            >
              <option value="straight">Straight</option>
              <option value="curved">Curved</option>
              <option value="elbow">Step</option>
            </ToolbarSelect>
            <ColorInput
              label="Line color"
              value={strokeColor}
              onChange={(color) =>
                onUpdateSelectedLocalStyle?.({
                  connector: {
                    stroke: {
                      color,
                      widthPt:
                        selectedNode.localStyle?.connector?.stroke?.widthPt ??
                        1.5,
                    },
                  },
                })
              }
            />
            <ToolbarNumber
              label="Line width"
              value={selectedNode.localStyle?.connector?.stroke?.widthPt ?? 1.5}
              min={0.5}
              max={12}
              step={0.5}
              onChange={(widthPt) =>
                onUpdateSelectedLocalStyle?.({
                  connector: {
                    stroke: { color: strokeColor, widthPt },
                  },
                })
              }
            />
            <ToolbarSelect
              label="Start arrow"
              value={selectedNode.localStyle?.connector?.startArrow ?? "none"}
              onChange={(startArrow) =>
                onUpdateSelectedLocalStyle?.({
                  connector: {
                    ...selectedNode.localStyle?.connector,
                    startArrow: startArrow as "none" | "arrow" | "filled",
                  },
                })
              }
              width="w-24"
            >
              <option value="none">Start: none</option>
              <option value="arrow">Start: arrow</option>
              <option value="filled">Start: filled</option>
            </ToolbarSelect>
            <ToolbarSelect
              label="End arrow"
              value={selectedNode.localStyle?.connector?.endArrow ?? "arrow"}
              onChange={(endArrow) =>
                onUpdateSelectedLocalStyle?.({
                  connector: {
                    ...selectedNode.localStyle?.connector,
                    endArrow: endArrow as "none" | "arrow" | "filled",
                  },
                })
              }
              width="w-24"
            >
              <option value="none">End: none</option>
              <option value="arrow">End: arrow</option>
              <option value="filled">End: filled</option>
            </ToolbarSelect>
          </>
        ) : null}

        {!isInlineEditing && selectedNode?.type === "table" ? (
          <>
            <TBtn
              label="Edit table cells"
              onClick={() => onEnterTableEdit?.()}
              disabled={onEnterTableEdit === undefined}
            >
              Edit
            </TBtn>
            <TBtn
              label="Insert row"
              onClick={() =>
                onUpdateSelectedContent?.(tableWithAddedRow(selectedNode))
              }
            >
              +R
            </TBtn>
            <TBtn
              label="Insert column"
              onClick={() =>
                onUpdateSelectedContent?.(tableWithAddedColumn(selectedNode))
              }
            >
              +C
            </TBtn>
            <TBtn
              label="Delete row"
              disabled={selectedNode.content.rows.length <= 1}
              onClick={() =>
                onUpdateSelectedContent?.(tableWithDeletedLastRow(selectedNode))
              }
            >
              -R
            </TBtn>
            <TBtn
              label="Delete column"
              disabled={selectedNode.content.columns.length <= 1}
              onClick={() =>
                onUpdateSelectedContent?.(
                  tableWithDeletedLastColumn(selectedNode),
                )
              }
            >
              -C
            </TBtn>
            <TBtn
              label="Toggle header row"
              active={selectedNode.content.header === true}
              onClick={() =>
                onUpdateSelectedContent?.({
                  header: selectedNode.content.header !== true,
                })
              }
            >
              H
            </TBtn>
          </>
        ) : null}

        {showArrangeGroup && selectedIds.length > 0 ? (
          <>
            <Divider />
            {!isMultiSelect && selectedNode?.type !== "connector" ? (
              <>
                <TBtn
                  label="Rotate left 15°"
                  onClick={() =>
                    onUpdateSelectedLayout?.({ rotation: rotation - 15 })
                  }
                >
                  <RotateCcw size={13} aria-hidden />
                </TBtn>
                <TBtn
                  label="Rotate right 15°"
                  onClick={() =>
                    onUpdateSelectedLayout?.({ rotation: rotation + 15 })
                  }
                >
                  <RotateCw size={13} aria-hidden />
                </TBtn>
              </>
            ) : null}
            {isMultiSelect ? (
              <>
                <TBtn
                  label="Align left"
                  onClick={() => onAlignSelection?.("left")}
                >
                  <AlignLeft size={13} aria-hidden />
                </TBtn>
                <TBtn
                  label="Align center"
                  onClick={() => onAlignSelection?.("center")}
                >
                  <AlignCenter size={13} aria-hidden />
                </TBtn>
                <TBtn
                  label="Align right"
                  onClick={() => onAlignSelection?.("right")}
                >
                  <AlignRight size={13} aria-hidden />
                </TBtn>
                <TBtn
                  label="Distribute horizontally"
                  disabled={selectedIds.length < 3}
                  onClick={() => onDistributeSelection?.("horizontal")}
                >
                  DH
                </TBtn>
                <TBtn
                  label="Distribute vertically"
                  disabled={selectedIds.length < 3}
                  onClick={() => onDistributeSelection?.("vertical")}
                >
                  DV
                </TBtn>
                <TBtn
                  label="Match width"
                  onClick={() => onMatchSize?.("width")}
                >
                  MW
                </TBtn>
                <TBtn
                  label="Match height"
                  onClick={() => onMatchSize?.("height")}
                >
                  MH
                </TBtn>
                <TBtn
                  label={selectedNode?.type === "group" ? "Ungroup" : "Group"}
                  onClick={selectedNode?.type === "group" ? onUngroup : onGroup}
                  disabled={
                    selectedIds.length < 2 && selectedNode?.type !== "group"
                  }
                >
                  {selectedNode?.type === "group" ? (
                    <Ungroup size={13} aria-hidden />
                  ) : (
                    <Group size={13} aria-hidden />
                  )}
                </TBtn>
              </>
            ) : null}

            {!isMultiSelect ? (
              <>
                <TBtn label="Bring forward" onClick={onBringForward}>
                  <BringToFront size={13} aria-hidden />
                </TBtn>
                <TBtn label="Send backward" onClick={onSendBackward}>
                  <SendToBack size={13} aria-hidden />
                </TBtn>
                <TBtn label="Bring to front" onClick={() => onBringToFront?.()}>
                  TF
                </TBtn>
                <TBtn label="Send to back" onClick={() => onSendToBack?.()}>
                  TB
                </TBtn>
              </>
            ) : null}

            <Divider />
            <TBtn
              label="Duplicate"
              onClick={onDuplicate}
              disabled={selectedIds.length === 0}
            >
              <Copy size={13} aria-hidden />
            </TBtn>
            <TBtn
              label="Delete"
              onClick={onDelete}
              disabled={selectedIds.length === 0}
            >
              <Trash2 size={13} aria-hidden />
            </TBtn>
            <Popover
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              portal
              align="center"
              trigger={
                <TBtn label="More" onClick={() => setMoreOpen((open) => !open)}>
                  <Ellipsis size={13} aria-hidden />
                </TBtn>
              }
              className="min-w-36 py-1"
              aria-label="More object actions"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onUpdateSelectedAttributes?.({
                    locked: selectedNode?.locked !== true,
                  });
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              >
                {selectedNode?.locked ? (
                  <Unlock size={12} aria-hidden />
                ) : (
                  <Lock size={12} aria-hidden />
                )}
                {selectedNode?.locked ? "Unlock" : "Lock"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onUpdateSelectedAttributes?.({ hidden: true });
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              >
                <EyeOff size={12} aria-hidden />
                Hide
              </button>
            </Popover>
          </>
        ) : null}

        {isDecorationSelected && !isInlineEditing ? (
          <>
            <Divider />
            <span className="px-1.5 text-[11px] text-ds-text-muted">
              Theme decoration
            </span>
            <button
              type="button"
              className={cx(
                "h-6 rounded-[var(--ds-radius-sm,6px)] border border-ds-border-subtle px-2 text-[11px] font-medium text-ds-text-secondary hover:bg-ds-state-hover",
                FOCUS_RING,
              )}
              onClick={onDetachDecoration}
              aria-label="Detach from theme"
            >
              Detach
            </button>
          </>
        ) : null}
      </div>
    </FloatingSurface>
  );
}
