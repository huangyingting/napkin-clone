"use client";

/**
 * Interactive editing stage for a single slide.
 *
 * Renders the shared {@link SlideCanvas} (so the editor preview is pixel-identical
 * to Present / public viewer) and layers a full editing surface on top:
 *
 *  - **Select / move** — click an element, drag its body to reposition.
 *  - **Resize** — eight handles (corners + edges) resize the element box.
 *  - **Inline text editing** — double-click a text or bullets element to edit
 *    its content directly on the slide; the underlying element is hidden while
 *    its editable overlay is shown so there is no double render.
 *  - **Contextual toolbar** — a floating toolbar above the selected element with
 *    quick font size, weight, alignment, color, layer, and delete controls.
 *  - **Live badge** — shows position / size while dragging.
 *
 * All geometry is expressed in percentage boxes so it stays resolution
 * independent. The component is controlled: it never mutates the deck.
 */

import { ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import {
  DECK_THEMES,
  SlideCanvas,
  type ThemeConfig,
} from "@/components/presentation/slide-canvas";
import { TextStyleBar } from "@/components/presentation/text-style-bar";
import { ColorPicker } from "@/components/ui";
import type { ElementBox, Slide, SlideElement } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { type SnapGuide, snapBox } from "@/lib/presentation/element-snap";
import type { Visual } from "@/lib/visual/schema";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DragMode = "move" | Handle;

interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBox: ElementBox;
}

const MIN_SIZE_PCT = 4;

/**
 * Snap threshold in percent of the slide dimension (issue #225). Kept small so
 * snapping is a subtle assist and never fights a deliberate drag.
 */
const SNAP_THRESHOLD_PCT = 1.5;

function clampBox(box: ElementBox): ElementBox {
  const w = Math.max(MIN_SIZE_PCT, Math.min(100, box.w));
  const h = Math.max(MIN_SIZE_PCT, Math.min(100, box.h));
  const x = Math.max(0, Math.min(100 - w, box.x));
  const y = Math.max(0, Math.min(100 - h, box.y));
  return { x, y, w, h };
}

function applyResize(
  box: ElementBox,
  handle: Handle,
  dxPct: number,
  dyPct: number,
): ElementBox {
  let { x, y, w, h } = box;
  if (handle.includes("e")) w += dxPct;
  if (handle.includes("s")) h += dyPct;
  if (handle.includes("w")) {
    x += dxPct;
    w -= dxPct;
  }
  if (handle.includes("n")) {
    y += dyPct;
    h -= dyPct;
  }
  return { x, y, w, h };
}

// Each resize handle renders a ~44px transparent hit area (touch target, issue
// #209) centred on its edge/corner, with a small visible dot drawn at its
// centre. The −22 offsets are half of that 44px box so the box's centre lands
// exactly on the element's edge/corner regardless of the dot's visual size.
const HANDLE_EDGE = -22;

const HANDLES: {
  handle: Handle;
  cursor: string;
  style: React.CSSProperties;
}[] = [
  {
    handle: "nw",
    cursor: "nwse-resize",
    style: { left: HANDLE_EDGE, top: HANDLE_EDGE },
  },
  {
    handle: "n",
    cursor: "ns-resize",
    style: { left: "50%", top: HANDLE_EDGE, transform: "translateX(-50%)" },
  },
  {
    handle: "ne",
    cursor: "nesw-resize",
    style: { right: HANDLE_EDGE, top: HANDLE_EDGE },
  },
  {
    handle: "e",
    cursor: "ew-resize",
    style: { right: HANDLE_EDGE, top: "50%", transform: "translateY(-50%)" },
  },
  {
    handle: "se",
    cursor: "nwse-resize",
    style: { right: HANDLE_EDGE, bottom: HANDLE_EDGE },
  },
  {
    handle: "s",
    cursor: "ns-resize",
    style: { left: "50%", bottom: HANDLE_EDGE, transform: "translateX(-50%)" },
  },
  {
    handle: "sw",
    cursor: "nesw-resize",
    style: { left: HANDLE_EDGE, bottom: HANDLE_EDGE },
  },
  {
    handle: "w",
    cursor: "ew-resize",
    style: { left: HANDLE_EDGE, top: "50%", transform: "translateY(-50%)" },
  },
];

function resolveTextColor(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  tc: ThemeConfig,
): string {
  if (element.kind === "text") {
    return (
      element.style.color ??
      (element.role === "title" ? tc.titleColor : tc.bodyColor)
    );
  }
  return element.style.color ?? tc.bodyColor;
}

interface SlideStageEditorProps {
  slide: Slide;
  visuals: ReadonlyMap<string, Visual>;
  width: number;
  height: number;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, patch: ElementPatch) => void;
  onRemoveElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
}

export function SlideStageEditor({
  slide,
  visuals,
  width,
  height,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onRemoveElement,
  onDuplicateElement,
  onBringToFront,
  onSendToBack,
}: SlideStageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  const elements = useMemo(() => slide.elements ?? [], [slide.elements]);
  // Live element list for the global pointer-move handler (which is memoized on
  // a stable identity and must not re-subscribe on every element change). The
  // ref is synced from an effect so it is never written during render.
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  const tc = DECK_THEMES[slide.theme] ?? DECK_THEMES.default;
  const textColorPresets = [
    tc.titleColor,
    tc.bodyColor,
    tc.mutedColor,
    tc.accentColor,
    "#ffffff",
    "#000000",
  ];

  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  // Editing is only active while the edited element is also the selection, so
  // changing slides or selecting another element implicitly exits edit mode
  // (no effect / setState needed).
  const editingElement =
    elements.find(
      (element) =>
        element.id === editingId &&
        element.id === selectedElementId &&
        (element.kind === "text" || element.kind === "bullets"),
    ) ?? null;
  const activeEditingId = editingElement?.id ?? null;

  const hiddenElementIds = useMemo(
    () => (editingElement ? new Set([editingElement.id]) : undefined),
    [editingElement],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const dxPct = ((event.clientX - drag.startClientX) / rect.width) * 100;
      const dyPct = ((event.clientY - drag.startClientY) / rect.height) * 100;

      if (drag.mode === "move") {
        const moved = clampBox({
          ...drag.startBox,
          x: drag.startBox.x + dxPct,
          y: drag.startBox.y + dyPct,
        });
        const others = elementsRef.current
          .filter((element) => element.id !== drag.id)
          .map((element) => element.box);
        const { box, guides } = snapBox(moved, others, SNAP_THRESHOLD_PCT);
        setSnapGuides(guides);
        onUpdateElement(drag.id, { box });
        return;
      }

      const next = applyResize(drag.startBox, drag.mode, dxPct, dyPct);
      onUpdateElement(drag.id, { box: clampBox(next) });
    },
    [onUpdateElement],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setActiveDrag(null);
    setSnapGuides([]);
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [handlePointerMove, endDrag]);

  const beginDrag = useCallback(
    (
      event: React.PointerEvent,
      id: string,
      mode: DragMode,
      box: ElementBox,
    ) => {
      event.stopPropagation();
      onSelectElement(id);
      dragRef.current = {
        id,
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBox: box,
      };
      setActiveDrag(mode);
    },
    [onSelectElement],
  );

  const startEditing = useCallback(
    (element: SlideElement) => {
      if (element.kind === "text" || element.kind === "bullets") {
        onSelectElement(element.id);
        setEditingId(element.id);
      }
    },
    [onSelectElement],
  );

  const stopEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  const badge =
    activeDrag && selectedElement
      ? formatBadge(activeDrag, selectedElement.box)
      : null;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ width, height }}
      onPointerDown={() => {
        if (!activeEditingId) {
          onSelectElement(null);
        }
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <SlideCanvas
          slide={slide}
          visuals={visuals}
          hiddenElementIds={hiddenElementIds}
          editable
        />
      </div>

      {/* Interaction layer */}
      <div className="absolute inset-0">
        {elements.map((element) => {
          const selected = element.id === selectedElementId;
          const isEditing = element.id === activeEditingId;
          const editable =
            element.kind === "text" || element.kind === "bullets";
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-label={`${element.kind} element`}
              onPointerDown={(event) => {
                if (isEditing) {
                  return;
                }
                beginDrag(event, element.id, "move", element.box);
              }}
              onDoubleClick={(event) => {
                if (editable) {
                  event.stopPropagation();
                  startEditing(element);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && editable) {
                  event.preventDefault();
                  startEditing(element);
                } else if (event.key === " ") {
                  event.preventDefault();
                  onSelectElement(element.id);
                }
              }}
              className={`absolute outline-none transition-colors ${
                isEditing ? "cursor-text" : "cursor-move"
              } ${
                selected
                  ? "ring-2 ring-ds-control"
                  : "ring-1 ring-transparent hover:ring-1 hover:ring-ds-control/40"
              }`}
              style={{
                left: `${element.box.x}%`,
                top: `${element.box.y}%`,
                width: `${element.box.w}%`,
                height: `${element.box.h}%`,
                zIndex: selected ? 1000 : element.zIndex + 1,
              }}
            >
              {isEditing && editable ? (
                <InlineTextEditor
                  element={element}
                  color={resolveTextColor(element, tc)}
                  stageHeight={height}
                  onChange={(patch) => onUpdateElement(element.id, patch)}
                  onCommit={stopEditing}
                />
              ) : null}

              {selected && !isEditing
                ? HANDLES.map(({ handle, cursor, style }) => (
                    <span
                      key={handle}
                      onPointerDown={(event) =>
                        beginDrag(event, element.id, handle, element.box)
                      }
                      aria-hidden="true"
                      className="absolute flex h-11 w-11 touch-none items-center justify-center"
                      style={{ ...style, cursor }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full border border-white bg-ds-control shadow" />
                    </span>
                  ))
                : null}
            </div>
          );
        })}

        {/* Snap alignment guides — thin lines shown while dragging an element. */}
        {activeDrag === "move" && snapGuides.length > 0
          ? snapGuides.map((guide) =>
              guide.axis === "x" ? (
                <div
                  key={`x-${guide.position}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-ds-control"
                  style={{ left: `${guide.position}%`, zIndex: 1400 }}
                />
              ) : (
                <div
                  key={`y-${guide.position}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 h-px bg-ds-control"
                  style={{ top: `${guide.position}%`, zIndex: 1400 }}
                />
              ),
            )
          : null}

        {/* Live position / size badge */}
        {badge ? (
          <div
            className="pointer-events-none absolute rounded-ds-sm bg-ds-inverse-surface px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ds-inverse-text"
            style={{
              left: `${(selectedElement?.box.x ?? 0) + (selectedElement?.box.w ?? 0) / 2}%`,
              top: `calc(${(selectedElement?.box.y ?? 0) + (selectedElement?.box.h ?? 0)}% + 6px)`,
              transform: "translateX(-50%)",
              zIndex: 1500,
            }}
          >
            {badge}
          </div>
        ) : null}

        {/* Contextual toolbar */}
        {selectedElement && !activeEditingId ? (
          <ElementToolbar
            element={selectedElement}
            width={width}
            height={height}
            textColorPresets={textColorPresets}
            onUpdateElement={onUpdateElement}
            onRemove={onRemoveElement}
            onDuplicate={onDuplicateElement}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onEdit={() => startEditing(selectedElement)}
          />
        ) : null}
      </div>
    </div>
  );
}

function formatBadge(mode: DragMode, box: ElementBox): string {
  if (mode === "move") {
    return `${Math.round(box.x)}, ${Math.round(box.y)}`;
  }
  return `${Math.round(box.w)} × ${Math.round(box.h)}`;
}

// ---------------------------------------------------------------------------
// Inline text editor — a transparent textarea overlay matching the element.
// ---------------------------------------------------------------------------

function InlineTextEditor({
  element,
  color,
  stageHeight,
  onChange,
  onCommit,
}: {
  element: Extract<SlideElement, { kind: "text" | "bullets" }>;
  color: string;
  stageHeight: number;
  onChange: (patch: ElementPatch) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const value =
    element.kind === "text" ? element.text : element.bullets.join("\n");

  useEffect(() => {
    const node = ref.current;
    if (node) {
      node.focus();
      node.select();
    }
  }, []);

  const commit = useCallback(() => {
    if (element.kind === "bullets") {
      const node = ref.current;
      const lines = (node?.value ?? "")
        .split("\n")
        .map((line) => line.replace(/\s+$/, ""))
        .filter((line) => line.length > 0);
      onChange({ bullets: lines });
    }
    onCommit();
  }, [element.kind, onChange, onCommit]);

  const fontSizePx = (element.style.fontSize / 100) * stageHeight;

  return (
    <textarea
      ref={ref}
      value={value}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        if (element.kind === "text") {
          onChange({ text: event.target.value });
        } else {
          onChange({ bullets: event.target.value.split("\n") });
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          commit();
        }
      }}
      className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent p-0 outline-none"
      style={{
        color,
        fontSize: `${fontSizePx}px`,
        fontWeight: element.style.bold ? 700 : 400,
        fontStyle: element.style.italic ? "italic" : "normal",
        textAlign: element.style.align,
        lineHeight: 1.2,
        overflow: "hidden",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Contextual toolbar — floats above the selected element.
// ---------------------------------------------------------------------------

function ToolbarButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-ds-sm transition-colors ${
        active
          ? "bg-ds-control text-ds-control-text"
          : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
      } ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

function ElementToolbar({
  element,
  width,
  height,
  textColorPresets,
  onUpdateElement,
  onRemove,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onEdit,
}: {
  element: SlideElement;
  width: number;
  height: number;
  textColorPresets: readonly string[];
  onUpdateElement: (id: string, patch: ElementPatch) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onEdit: () => void;
}) {
  const isText = element.kind === "text" || element.kind === "bullets";
  const style = isText ? element.style : null;

  // Position: centered above the element, flipping below near the top edge.
  const elTopPx = (element.box.y / 100) * height;
  const placeBelow = elTopPx < 44;
  const topPx = placeBelow
    ? ((element.box.y + element.box.h) / 100) * height + 8
    : elTopPx - 8;
  const leftPx = ((element.box.x + element.box.w / 2) / 100) * width;
  const clampedLeft = Math.max(90, Math.min(width - 90, leftPx));

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute flex items-center gap-0.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised px-1 py-1 shadow-ds-overlay"
      style={{
        left: clampedLeft,
        top: topPx,
        transform: placeBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
        zIndex: 2000,
      }}
    >
      {isText && style ? (
        <>
          <TextStyleBar
            variant="compact"
            style={style}
            colorPresets={textColorPresets}
            onChange={(next) => onUpdateElement(element.id, { style: next })}
          />
          <Divider />
        </>
      ) : null}

      {element.kind === "shape" ? (
        <ColorPicker
          color={element.color}
          aria-label="Shape color"
          onChange={(hex) => onUpdateElement(element.id, { color: hex })}
        />
      ) : null}

      {isText ? (
        <ToolbarButton label="Edit text" onClick={onEdit}>
          <span className="text-[11px] font-semibold">Aa</span>
        </ToolbarButton>
      ) : null}

      <Divider />
      <ToolbarButton
        label="Duplicate element"
        onClick={() => onDuplicate(element.id)}
      >
        <Copy size={14} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Bring to front"
        onClick={() => onBringToFront(element.id)}
      >
        <ArrowUpToLine size={14} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Send to back"
        onClick={() => onSendToBack(element.id)}
      >
        <ArrowDownToLine size={14} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Delete element"
        onClick={() => onRemove(element.id)}
      >
        <Trash2 size={14} aria-hidden="true" />
      </ToolbarButton>
    </div>
  );
}

function Divider() {
  return (
    <span className="mx-0.5 h-5 w-px bg-ds-border-subtle" aria-hidden="true" />
  );
}
