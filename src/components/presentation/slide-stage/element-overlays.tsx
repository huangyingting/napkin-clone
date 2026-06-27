"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  Group,
  Indent,
  Layers,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Lock,
  LockOpen,
  Minus,
  Outdent,
  Palette,
  Pencil,
  Scissors,
  Spline,
  Trash2,
  Ungroup,
  type LucideIcon,
} from "lucide-react";

import { TextStyleBar } from "@/components/presentation/text-style-bar";
import {
  ColorPicker,
  DEFAULT_SWATCH_PRESETS,
  ToolbarButton as StageToolbarButton,
} from "@/components/ui";
import { cx, MENU_CHROME, MENU_ITEM } from "@/components/ui/tokens";
import type {
  ConnectorArrow,
  SlideElement,
  TextElementStyle,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";
import { mergeSwatches } from "@/lib/presentation/text-style";
import { isInlineEditableStageElement } from "@/lib/presentation/stage-interaction";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import {
  INLINE_TEXT_COMMAND_EVENT,
  type InlineTextCommandDetail,
  type InlineTextCommandPayload,
} from "@/components/presentation/slide-stage/inline-text-editor";
import {
  connectorContent,
  connectorDesign,
  elementDesignOverrides,
  shapeContent,
  shapeTextDesign,
  textContent,
  textDesign,
} from "@/components/presentation/slide-canvas/v6-model";

function defaultShapeTextStyle(): TextElementStyle {
  return {
    fontSize: SLIDE_TEXT_FONT_SIZE.text,
    bold: false,
    italic: false,
    align: "center" as const,
  };
}

// ---------------------------------------------------------------------------
// Contextual floating toolbar + right-click context menu (Canva-style). Both
// portal to `document.body` so they escape the stage's `overflow:hidden`, and
// sit above the editor modal via an explicit z-index.
// ---------------------------------------------------------------------------

const OVERLAY_Z = 80;

function ElementToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <StageToolbarButton aria-label={label} title={label} onClick={onClick}>
      <Icon size={14} aria-hidden="true" />
    </StageToolbarButton>
  );
}

function ElementToolbarButtonWithText({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <StageToolbarButton aria-label={label} title={label} onClick={onClick}>
      <Icon size={14} aria-hidden="true" />
    </StageToolbarButton>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px bg-ds-border-subtle" aria-hidden />;
}

/** The controls inside the context toolbar, varying by element kind. */
export function ElementToolbarContent({
  element,
  tc,
  brandSwatches,
  onUpdateElement,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onRemove,
  hideObjectActions = false,
  showAdvanced = true,
  compact = false,
}: {
  element: SlideElement;
  tc: SlideThemeColors;
  brandSwatches: readonly string[];
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRemove: () => void;
  hideObjectActions?: boolean;
  showAdvanced?: boolean;
  compact?: boolean;
}) {
  const textColorPresets = mergeSwatches(brandSwatches, [
    tc.titleColor,
    tc.bodyColor,
    tc.mutedColor,
    tc.accentColor,
    "#ffffff",
    "#000000",
  ]);
  const shapeColorPresets = mergeSwatches(
    brandSwatches,
    DEFAULT_SWATCH_PRESETS,
  );
  const currentTextContent =
    element.kind === "text" ? textContent(element) : null;
  const textParagraphs = currentTextContent?.paragraphs ?? [];
  const allBullets =
    textParagraphs.length > 0 &&
    textParagraphs.every((paragraph) => paragraph.listType === "bullet");
  const allNumbers =
    textParagraphs.length > 0 &&
    textParagraphs.every((paragraph) => paragraph.listType === "number");
  const updateTextParagraphs = (
    paragraphs: typeof textParagraphs,
    textRole?: "body" | "bullet",
  ) => {
    if (element.kind !== "text") return;
    const current = textContent(element);
    onUpdateElement(element.id, {
      role: textRole ?? (element as { role?: string }).role,
      content: {
        ...current,
        kind: "text",
        text: paragraphs.map((paragraph) => paragraph.text).join("\n"),
        paragraphs,
      },
    } as ElementPatch);
  };
  const nextArrow = (arrow: ConnectorArrow): ConnectorArrow => {
    if (arrow === "none") return "arrow";
    if (arrow === "arrow") return "filled";
    return "none";
  };
  const dispatchInlineTextCommand = (command: InlineTextCommandPayload) => {
    window.dispatchEvent(
      new CustomEvent<InlineTextCommandDetail>(INLINE_TEXT_COMMAND_EVENT, {
        detail: {
          elementId: element.id,
          ...command,
        } as InlineTextCommandDetail,
      }),
    );
  };
  const handleTextStyleChange = (style: TextElementStyle) => {
    if (element.kind !== "text") return;
    if (!hideObjectActions) {
      onUpdateElement(element.id, {
        designOverrides: {
          ...elementDesignOverrides(element),
          textStyle: style,
        },
      } as ElementPatch);
      return;
    }
    const currentStyle = textDesign(element);
    if (style.bold !== currentStyle.bold) {
      dispatchInlineTextCommand({ command: "bold" });
    }
    if (style.italic !== currentStyle.italic) {
      dispatchInlineTextCommand({ command: "italic" });
    }
    if ((style.underline ?? false) !== (currentStyle.underline ?? false)) {
      dispatchInlineTextCommand({ command: "underline" });
    }
    if (style.color !== currentStyle.color && style.color) {
      dispatchInlineTextCommand({ command: "color", value: style.color });
    }
    if (style.align !== currentStyle.align) {
      dispatchInlineTextCommand({ command: "align", value: style.align });
    }
    if (style.fontSize !== currentStyle.fontSize) {
      dispatchInlineTextCommand({ command: "fontSize", value: style.fontSize });
    }
  };
  const textStyle =
    element.kind === "text"
      ? {
          fontSize: textDesign(element).fontSize ?? SLIDE_TEXT_FONT_SIZE.text,
          bold: textDesign(element).bold ?? false,
          italic: textDesign(element).italic ?? false,
          align: textDesign(element).align ?? ("left" as const),
          ...textDesign(element),
        }
      : undefined;
  const shape =
    element.kind === "shape" ? shapeContent(element).shape : undefined;
  const shapeDesign =
    element.kind === "shape" ? elementDesignOverrides(element) : undefined;
  const shapeFill =
    element.kind === "shape" &&
    typeof (shapeDesign?.fill as { value?: unknown } | undefined)?.value ===
      "string"
      ? (shapeDesign?.fill as { value: string }).value
      : tc.accentColor;
  const shapeLabelStyle =
    element.kind === "shape"
      ? {
          ...defaultShapeTextStyle(),
          ...shapeTextDesign(element),
        }
      : undefined;
  const connector =
    element.kind === "connector" ? connectorContent(element) : null;
  const connectorStyle =
    element.kind === "connector" ? connectorDesign(element) : null;
  const connectorRouting = connector?.routing ?? "straight";
  const connectorDash = connectorStyle?.dash ?? false;
  const connectorArrowStart = connectorStyle?.arrowStart ?? "none";
  const connectorArrowEnd = connectorStyle?.arrowEnd ?? "arrow";
  return (
    <>
      {element.kind === "text" ? (
        <>
          <TextStyleBar
            variant="compact"
            style={textStyle!}
            colorPresets={textColorPresets}
            onChange={handleTextStyleChange}
          />
          <ElementToolbarButtonWithText
            label={allBullets ? "Remove bullets" : "Bulleted list"}
            icon={List}
            onClick={() =>
              hideObjectActions
                ? dispatchInlineTextCommand({
                    command: "list",
                    value: allBullets ? undefined : "bullet",
                  })
                : updateTextParagraphs(
                    textParagraphs.map((paragraph) => {
                      const next = { ...paragraph };
                      if (allBullets) delete next.listType;
                      else next.listType = "bullet";
                      return next;
                    }),
                    allBullets ? "body" : "bullet",
                  )
            }
          />
          <ElementToolbarButtonWithText
            label={allNumbers ? "Remove numbering" : "Numbered list"}
            icon={ListOrdered}
            onClick={() =>
              hideObjectActions
                ? dispatchInlineTextCommand({
                    command: "list",
                    value: allNumbers ? undefined : "number",
                  })
                : updateTextParagraphs(
                    textParagraphs.map((paragraph) => {
                      const next = { ...paragraph };
                      if (allNumbers) delete next.listType;
                      else next.listType = "number";
                      return next;
                    }),
                    allNumbers ? "body" : "bullet",
                  )
            }
          />
          <ElementToolbarButtonWithText
            label="Outdent list paragraphs"
            icon={Outdent}
            onClick={() =>
              hideObjectActions
                ? dispatchInlineTextCommand({ command: "indent", delta: -1 })
                : updateTextParagraphs(
                    textParagraphs.map((paragraph) => ({
                      ...paragraph,
                      indent: Math.max(0, (paragraph.indent ?? 0) - 1),
                    })),
                  )
            }
          />
          <ElementToolbarButtonWithText
            label="Indent list paragraphs"
            icon={Indent}
            onClick={() =>
              hideObjectActions
                ? dispatchInlineTextCommand({ command: "indent", delta: 1 })
                : updateTextParagraphs(
                    textParagraphs.map((paragraph) => ({
                      ...paragraph,
                      indent: Math.min(5, (paragraph.indent ?? 0) + 1),
                      listType: paragraph.listType ?? "bullet",
                    })),
                    "bullet",
                  )
            }
          />
          <ToolbarDivider />
        </>
      ) : null}
      {element.kind === "shape" ? (
        <>
          <ColorPicker
            color={shapeFill}
            onChange={(color) =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  fill: { value: color },
                },
              } as ElementPatch)
            }
            aria-label="Shape color"
            presets={shapeColorPresets}
            size="lg"
            triggerChrome="toolbar"
            icon={<Palette size={14} aria-hidden="true" />}
          />
          {shape !== "line" ? (
            <TextStyleBar
              variant="compact"
              style={shapeLabelStyle!}
              colorPresets={textColorPresets}
              onChange={(textStyle) =>
                onUpdateElement(element.id, {
                  designOverrides: {
                    ...elementDesignOverrides(element),
                    textStyle,
                  },
                } as ElementPatch)
              }
            />
          ) : null}
          <ToolbarDivider />
        </>
      ) : null}
      {element.kind === "connector" ? (
        <>
          <ElementToolbarButton
            icon={connectorRouting === "elbow" ? Minus : Spline}
            label={
              connectorRouting === "elbow"
                ? "Straight routing"
                : "Elbow routing"
            }
            onClick={() =>
              onUpdateElement(element.id, {
                content: {
                  ...connector!,
                  kind: "connector",
                  routing: connectorRouting === "elbow" ? "straight" : "elbow",
                },
              } as ElementPatch)
            }
          />
          <ElementToolbarButton
            icon={connectorDash ? Link : Link2Off}
            label={connectorDash ? "Solid line" : "Dashed line"}
            onClick={() =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  dash: !connectorDash,
                },
              } as ElementPatch)
            }
          />
          <ElementToolbarButtonWithText
            label="Cycle start arrowhead"
            icon={ArrowLeftFromLine}
            onClick={() =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  arrowStart: nextArrow(connectorArrowStart),
                },
              } as ElementPatch)
            }
          />
          <ElementToolbarButtonWithText
            label="Cycle end arrowhead"
            icon={ArrowRightFromLine}
            onClick={() =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...elementDesignOverrides(element),
                  arrowEnd: nextArrow(connectorArrowEnd),
                },
              } as ElementPatch)
            }
          />
          <ToolbarDivider />
        </>
      ) : null}
      {!hideObjectActions ? (
        <ElementToolbarButton
          icon={Copy}
          label="Duplicate"
          onClick={onDuplicate}
        />
      ) : null}
      {showAdvanced && !compact && !hideObjectActions ? (
        <>
          <ElementToolbarButton
            icon={ArrowUpToLine}
            label="Bring to front"
            onClick={onBringToFront}
          />
          <ElementToolbarButton
            icon={ArrowDownToLine}
            label="Send to back"
            onClick={onSendToBack}
          />
        </>
      ) : null}
      {!hideObjectActions ? (
        <ElementToolbarButton icon={Trash2} label="Delete" onClick={onRemove} />
      ) : null}
    </>
  );
}

/** Right-click menu of element actions, anchored at the pointer. */
export function ElementContextMenu({
  x,
  y,
  element,
  allElements,
  candidates,
  onClose,
  onSelectCandidate,
  onEdit,
  onDuplicate,
  onCopy,
  onCut,
  onPaste,
  onRemove,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  onDetachConnectorStart,
  onDetachConnectorEnd,
  canGroup,
  onGroup,
  onUngroup,
  showAdvanced,
}: {
  x: number;
  y: number;
  element: SlideElement | null;
  allElements: readonly SlideElement[];
  candidates: readonly SlideElement[];
  onClose: () => void;
  onSelectCandidate: (id: string) => void;
  onEdit: (element: SlideElement) => void;
  onDuplicate: (id: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRemove: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  /** Called when user requests to detach the connector start endpoint. */
  onDetachConnectorStart: () => void;
  /** Called when user requests to detach the connector end endpoint. */
  onDetachConnectorEnd: () => void;
  canGroup: boolean;
  onGroup: () => void;
  onUngroup: (groupId: string) => void;
  showAdvanced: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({
      top: Math.min(y, window.innerHeight - el.offsetHeight - 8),
      left: Math.min(x, window.innerWidth - el.offsetWidth - 8),
    });
  }, [x, y]);

  // Focus first menu item on open and handle Arrow key navigation.
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const items = () =>
      Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const els = items();
      const idx = els.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        els[(idx + 1) % els.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        els[(idx - 1 + els.length) % els.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        els[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        els[els.length - 1]?.focus();
      }
    }

    menu.addEventListener("keydown", onKey);
    const close = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", close);
    return () => {
      menu.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", close);
    };
  }, [onClose]);

  if (!element || typeof document === "undefined") return null;
  const editable = isInlineEditableStageElement(element);
  const layerCandidates = candidates.length > 1 ? candidates : [];
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const item = (label: string, icon: LucideIcon, onSelect: () => void) => {
    const Icon = icon;
    return (
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={MENU_ITEM}
        onClick={run(onSelect)}
      >
        <Icon size={14} aria-hidden="true" className="mr-2 shrink-0" />
        {label}
      </button>
    );
  };
  return createPortal(
    <div
      ref={ref}
      data-floating-panel="true"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: OVERLAY_Z,
      }}
      className={cx("w-48", MENU_CHROME)}
      role="menu"
      aria-label="Element actions"
    >
      {layerCandidates.length > 0 ? (
        <>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ds-text-muted">
            Select layer
          </div>
          {layerCandidates.map((candidate) => {
            const selected = candidate.id === element.id;
            return (
              <button
                key={candidate.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={MENU_ITEM}
                onClick={run(() => onSelectCandidate(candidate.id))}
              >
                <Layers
                  size={14}
                  aria-hidden="true"
                  className="mr-2 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {elementAccessibleName(candidate, allElements)}
                </span>
                {selected ? (
                  <span className="ml-2 text-[10px] text-ds-text-muted">
                    Current
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
        </>
      ) : null}
      {editable ? item("Edit text", Pencil, () => onEdit(element)) : null}
      {item("Duplicate", Copy, () => onDuplicate(element.id))}
      {item("Copy", Copy, onCopy)}
      {item("Cut", Scissors, onCut)}
      {item("Paste", ClipboardPaste, onPaste)}
      {/* Connector-specific: detach endpoints (issue #325) */}
      {element.kind === "connector" ? (
        <>
          <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
          {item("Detach start", Link2Off, onDetachConnectorStart)}
          {item("Detach end", Link2Off, onDetachConnectorEnd)}
        </>
      ) : null}
      {showAdvanced ? (
        <>
          <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
          {item("Bring to front", ArrowUpToLine, () =>
            onBringToFront(element.id),
          )}
          {item("Send to back", ArrowDownToLine, () =>
            onSendToBack(element.id),
          )}
          {canGroup ? item("Group", Group, onGroup) : null}
          {element.groupId
            ? item("Ungroup", Ungroup, () =>
                onUngroup(element.groupId as string),
              )
            : null}
          <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
          {item(
            element.locked ? "Unlock" : "Lock",
            element.locked ? LockOpen : Lock,
            () => onToggleLock(element.id, !element.locked),
          )}
        </>
      ) : null}
      <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
      {item("Delete", Trash2, () => onRemove(element.id))}
    </div>,
    document.body,
  );
}
