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

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import {
  DECK_THEMES,
  SlideCanvas,
  type ThemeConfig,
} from "@/components/presentation/slide-canvas";
import { TextStyleBar } from "@/components/presentation/text-style-bar";
import { ColorPicker, IconButton } from "@/components/ui";
import type { ElementBox, Slide, SlideElement } from "@/lib/presentation/deck";
import type { AlignMode } from "@/lib/presentation/element-align";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { type SnapGuide, snapBox } from "@/lib/presentation/element-snap";
import { clampToolbarLeft } from "@/lib/presentation/toolbar-position";
import {
  boxesIntersectingRect,
  normalizeRect,
  type MarqueeRect,
} from "@/lib/presentation/marquee-select";
import type { Visual } from "@/lib/visual/schema";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DragMode = "move" | Handle;

interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBox: ElementBox;
  /** Coalesce key for the whole gesture so it forms one undo step (#242). */
  coalesceKey: string;
}

/**
 * In-flight marquee (rubber-band) selection (issue #245). Records where on the
 * stage (in percent) the band started and whether the gesture is additive
 * (shift/ctrl/cmd held at pointer-down, so the result unions with the existing
 * selection). The live rectangle is tracked separately for rendering.
 */
interface MarqueeState {
  startXPct: number;
  startYPct: number;
  additive: boolean;
  /** True once the band has grown past {@link MARQUEE_THRESHOLD_PCT}. */
  moved: boolean;
}

/**
 * Minimum band size (percent of the slide) before a stage-background drag is
 * treated as a marquee rather than a plain click. Keeps a small jitter on tap
 * from clearing — or worse, reselecting — the current selection.
 */
const MARQUEE_THRESHOLD_PCT = 1;

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

interface SelectionBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tight bounding box (percent) enclosing every box. Used to place the align
 * toolbar over a multi-selection. */
function boundsOf(boxes: ElementBox[]): SelectionBounds {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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

/**
 * How a selection request should fold into the current selection. `"replace"`
 * (the default, plain click) selects just the one element; `"toggle"`
 * (shift/ctrl/cmd-click) adds or removes it from a multi-selection; `"keep"`
 * makes it the primary without disturbing an existing multi-selection (used when
 * starting a drag on an already-selected element). Issue #237.
 */
export type SelectionMode = "replace" | "toggle" | "keep";

interface SlideStageEditorProps {
  slide: Slide;
  visuals: ReadonlyMap<string, Visual>;
  width: number;
  height: number;
  selectedElementId: string | null;
  selectedElementIds: ReadonlySet<string>;
  onSelectElement: (id: string | null, mode?: SelectionMode) => void;
  /**
   * Replaces the multi-selection with the given ids (issue #245). `additive`
   * unions with the current selection instead (shift/ctrl/cmd marquee). Used by
   * the marquee; the first id becomes the primary.
   */
  onSelectElements: (ids: string[], additive?: boolean) => void;
  onAlignElements: (mode: AlignMode) => void;
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
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
  selectedElementIds,
  onSelectElement,
  onSelectElements,
  onAlignElements,
  onUpdateElement,
  onRemoveElement,
  onDuplicateElement,
  onBringToFront,
  onSendToBack,
}: SlideStageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragMode | null>(null);
  // In-flight marquee selection (issue #245). The ref drives the pointer math;
  // `marqueeRect` mirrors it for rendering the band; `marqueeRectRef` holds the
  // latest normalized rect so pointer-up can resolve the selection even when the
  // final move and the up arrive in the same frame.
  const marqueeRef = useRef<MarqueeState | null>(null);
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  // Monotonic gesture counter (issue #242). Each drag / resize / inline-edit
  // gesture derives a coalesce key with a unique suffix so consecutive gestures
  // of the same kind on the same element never merge into one undo step.
  const gestureSeqRef = useRef(0);
  const nextGestureKey = useCallback((prefix: string, id: string) => {
    gestureSeqRef.current += 1;
    return `${prefix}:${id}#${gestureSeqRef.current}`;
  }, []);
  // Coalesce key for the active inline-text typing session, or null when not
  // editing — the whole session collapses to one undo step (issue #242).
  const [editCoalesceKey, setEditCoalesceKey] = useState<string | null>(null);

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
  // Elements in the multi-selection that still exist on this slide, plus a
  // convenience flag for "2+ selected" (issue #237). The single-select path is
  // unchanged: a 1-element selection behaves exactly as before.
  const selectedElements = useMemo(
    () => elements.filter((element) => selectedElementIds.has(element.id)),
    [elements, selectedElementIds],
  );
  const isMultiSelect = selectedElements.length >= 2;
  const selectionBounds = useMemo(
    () => (isMultiSelect ? boundsOf(selectedElements.map((e) => e.box)) : null),
    [isMultiSelect, selectedElements],
  );
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
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      // Marquee selection takes precedence: while a band is being drawn there is
      // no element drag in flight (the two start from mutually exclusive
      // pointer-downs). Issue #245.
      const marquee = marqueeRef.current;
      if (marquee) {
        const curX = ((event.clientX - rect.left) / rect.width) * 100;
        const curY = ((event.clientY - rect.top) / rect.height) * 100;
        const raw: MarqueeRect = {
          x: marquee.startXPct,
          y: marquee.startYPct,
          w: curX - marquee.startXPct,
          h: curY - marquee.startYPct,
        };
        const norm = normalizeRect(raw);
        if (
          norm.w >= MARQUEE_THRESHOLD_PCT ||
          norm.h >= MARQUEE_THRESHOLD_PCT
        ) {
          marquee.moved = true;
        }
        marqueeRectRef.current = norm;
        setMarqueeRect(norm);
        return;
      }

      const drag = dragRef.current;
      if (!drag) {
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
        onUpdateElement(drag.id, { box }, drag.coalesceKey);
        return;
      }

      const next = applyResize(drag.startBox, drag.mode, dxPct, dyPct);
      onUpdateElement(drag.id, { box: clampBox(next) }, drag.coalesceKey);
    },
    [onUpdateElement],
  );

  const endDrag = useCallback(() => {
    // Resolve a marquee gesture: a band that grew past the threshold selects
    // every intersecting element (additive when shift/ctrl/cmd was held);
    // otherwise the gesture was a bare click on empty stage and clears the
    // selection. Issue #245.
    const marquee = marqueeRef.current;
    if (marquee) {
      const finalRect = marqueeRectRef.current;
      marqueeRef.current = null;
      marqueeRectRef.current = null;
      setMarqueeRect(null);
      if (marquee.moved && finalRect) {
        const ids = boxesIntersectingRect(
          elementsRef.current.map((element) => ({
            id: element.id,
            box: element.box,
          })),
          finalRect,
        );
        onSelectElements(ids, marquee.additive);
      } else if (!marquee.additive) {
        onSelectElement(null);
      }
    }
    dragRef.current = null;
    setActiveDrag(null);
    setSnapGuides([]);
  }, [onSelectElement, onSelectElements]);

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
      // Dragging an element that is already part of a multi-selection keeps that
      // selection (and makes the dragged element primary) so the user can still
      // align it; otherwise a plain drag collapses to a single selection. Group
      // move is intentionally not implemented — only the dragged element moves.
      onSelectElement(id, selectedElementIds.has(id) ? "keep" : "replace");
      dragRef.current = {
        id,
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBox: box,
        coalesceKey: nextGestureKey(mode === "move" ? "move" : "resize", id),
      };
      setActiveDrag(mode);
    },
    [nextGestureKey, onSelectElement, selectedElementIds],
  );

  const startEditing = useCallback(
    (element: SlideElement) => {
      if (element.kind === "text" || element.kind === "bullets") {
        onSelectElement(element.id);
        setEditingId(element.id);
        setEditCoalesceKey(nextGestureKey("edit-text", element.id));
      }
    },
    [nextGestureKey, onSelectElement],
  );

  const stopEditing = useCallback(() => {
    setEditingId(null);
    setEditCoalesceKey(null);
  }, []);

  // Pointer-down on the empty stage background starts a marquee (issue #245).
  // Element pointer-downs stop propagation (they begin a drag or a shift-toggle)
  // so this only fires on bare background. Skipped while inline-editing and for
  // non-primary mouse buttons. The selection is not cleared here — that is
  // deferred to pointer-up so a true drag can build a selection first.
  const handleStagePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (activeEditingId || event.button !== 0) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const xPct = ((event.clientX - rect.left) / rect.width) * 100;
      const yPct = ((event.clientY - rect.top) / rect.height) * 100;
      marqueeRef.current = {
        startXPct: xPct,
        startYPct: yPct,
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        moved: false,
      };
      marqueeRectRef.current = { x: xPct, y: yPct, w: 0, h: 0 };
    },
    [activeEditingId],
  );

  const badge =
    activeDrag && selectedElement
      ? formatBadge(activeDrag, selectedElement.box)
      : null;

  return (
    <div
      ref={containerRef}
      className="relative touch-none overflow-hidden rounded-ds-sm bg-ds-surface-raised shadow-ds-overlay ring-1 ring-ds-border-strong"
      style={{ width, height }}
      onPointerDown={handleStagePointerDown}
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
          const isPrimary = element.id === selectedElementId;
          const inSelection = selectedElementIds.has(element.id);
          const selected = isPrimary || inSelection;
          const isEditing = element.id === activeEditingId;
          const editable =
            element.kind === "text" || element.kind === "bullets";
          // Resize handles only attach to a single (primary) selection — they
          // would be ambiguous across a multi-selection. Issue #237.
          const showHandles = isPrimary && !isEditing && !isMultiSelect;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-label={`${element.kind} element`}
              aria-pressed={selected}
              onPointerDown={(event) => {
                if (isEditing) {
                  return;
                }
                // Shift / Ctrl / Cmd-click toggles the element in the
                // multi-selection without starting a drag. Issue #237.
                if (event.shiftKey || event.metaKey || event.ctrlKey) {
                  event.stopPropagation();
                  onSelectElement(element.id, "toggle");
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
                  onSelectElement(
                    element.id,
                    event.shiftKey ? "toggle" : "replace",
                  );
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
                  onChange={(patch) =>
                    onUpdateElement(
                      element.id,
                      patch,
                      editCoalesceKey ?? undefined,
                    )
                  }
                  onCommit={stopEditing}
                />
              ) : null}

              {showHandles
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

        {/* Marquee (rubber-band) selection rectangle — issue #245. */}
        {marqueeRect &&
        (marqueeRect.w >= MARQUEE_THRESHOLD_PCT ||
          marqueeRect.h >= MARQUEE_THRESHOLD_PCT) ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-ds-control bg-ds-control/10"
            style={{
              left: `${marqueeRect.x}%`,
              top: `${marqueeRect.y}%`,
              width: `${marqueeRect.w}%`,
              height: `${marqueeRect.h}%`,
              zIndex: 1450,
            }}
          />
        ) : null}

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

        {/* Contextual toolbar — single (primary) selection only. */}
        {selectedElement && !activeEditingId && !isMultiSelect ? (
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

        {/* Align toolbar — shown above the selection bounding box when 2+
            elements are selected (issue #237). */}
        {isMultiSelect && selectionBounds && !activeEditingId ? (
          <AlignToolbar
            bounds={selectionBounds}
            width={width}
            height={height}
            onAlign={onAlignElements}
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
      onChange({ bullets: lines, bulletRuns: undefined });
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
          onChange({ text: event.target.value, runs: undefined });
        } else {
          onChange({
            bullets: event.target.value.split("\n"),
            bulletRuns: undefined,
          });
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

// ---------------------------------------------------------------------------
// Align toolbar — floats above a multi-selection's bounding box (issue #237).
// ---------------------------------------------------------------------------

const ALIGN_ACTIONS: {
  mode: AlignMode;
  label: string;
  Icon: typeof AlignLeft;
}[] = [
  { mode: "left", label: "Align left", Icon: AlignLeft },
  { mode: "hcenter", label: "Align horizontal centers", Icon: AlignCenter },
  { mode: "right", label: "Align right", Icon: AlignRight },
  { mode: "top", label: "Align top", Icon: AlignVerticalJustifyStart },
  {
    mode: "vmiddle",
    label: "Align vertical centers",
    Icon: AlignVerticalJustifyCenter,
  },
  { mode: "bottom", label: "Align bottom", Icon: AlignVerticalJustifyEnd },
];

function AlignToolbar({
  bounds,
  width,
  height,
  onAlign,
}: {
  bounds: SelectionBounds;
  width: number;
  height: number;
  onAlign: (mode: AlignMode) => void;
}) {
  // Position: centered above the selection bounding box, flipping below when it
  // is near the top edge (mirrors {@link ElementToolbar}).
  const topPxRaw = (bounds.y / 100) * height;
  const placeBelow = topPxRaw < 44;
  const topPx = placeBelow
    ? ((bounds.y + bounds.h) / 100) * height + 8
    : topPxRaw - 8;
  const leftPx = ((bounds.x + bounds.w / 2) / 100) * width;
  const clampedLeft = clampToolbarLeft(leftPx, width, 120);

  return (
    <div
      role="toolbar"
      aria-label="Align selected elements"
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute flex items-center gap-0.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised px-1 py-1 shadow-ds-overlay"
      style={{
        left: clampedLeft,
        top: topPx,
        transform: placeBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
        zIndex: 2000,
      }}
    >
      {ALIGN_ACTIONS.map(({ mode, label, Icon }, i) => (
        <span key={mode} className="flex items-center">
          {i === 3 ? <Divider /> : null}
          <IconButton
            size="sm"
            aria-label={label}
            title={label}
            onClick={() => onAlign(mode)}
          >
            <Icon size={14} aria-hidden="true" />
          </IconButton>
        </span>
      ))}
    </div>
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
  const clampedLeft = clampToolbarLeft(leftPx, width, 90);

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
