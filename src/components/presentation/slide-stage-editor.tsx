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
 *  - **Live badge** — shows position / size while dragging.
 *
 * All geometry is expressed in percentage boxes so it stays resolution
 * independent. The component is controlled: it never mutates the deck.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  DECK_THEMES,
  SlideCanvas,
  type ThemeConfig,
} from "@/components/presentation/slide-canvas";
import type { ElementBox, Slide, SlideElement } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { type SnapGuide, snapBox } from "@/lib/presentation/element-snap";
import {
  boxesIntersectingRect,
  normalizeRect,
  type MarqueeRect,
} from "@/lib/presentation/marquee-select";
import {
  mergeRuns,
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
  splitRunsIntoLines,
} from "@/lib/presentation/rich-text-html";
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

const AUTO_FIT_PADDING_PCT = 1.2;
const TEXT_MIN_W_PCT = 10;
const TEXT_MIN_H_PCT = 5;
const BULLETS_MIN_W_PCT = 18;
const SELECTION_MIN_H_PCT = 4;

function clampBox(box: ElementBox): ElementBox {
  const w = Math.max(MIN_SIZE_PCT, Math.min(100, box.w));
  const h = Math.max(MIN_SIZE_PCT, Math.min(100, box.h));
  const x = Math.max(0, Math.min(100 - w, box.x));
  const y = Math.max(0, Math.min(100 - h, box.y));
  return { x, y, w, h };
}

function clampFitSize(
  widthPct: number,
  heightPct: number,
  minWidthPct: number,
  minHeightPct: number,
): { w: number; h: number } {
  return {
    w: Math.max(minWidthPct, Math.min(100, widthPct)),
    h: Math.max(minHeightPct, Math.min(100, heightPct)),
  };
}

function positionFitWithinBox(
  source: ElementBox,
  size: { w: number; h: number },
  align: "left" | "center" | "right" = "center",
): ElementBox {
  let x = source.x;
  if (align === "center") {
    x = source.x + (source.w - size.w) / 2;
  } else if (align === "right") {
    x = source.x + source.w - size.w;
  }
  const y = source.y + Math.max(0, (source.h - size.h) / 2);
  return clampBox({ x, y, w: size.w, h: size.h });
}

function textLineWidthPct(
  text: string,
  fontSizePct: number,
  stageAspect: number,
): number {
  const visibleChars = Math.max(1, text.trimEnd().length);
  return (visibleChars * fontSizePct * 0.56) / stageAspect;
}

function fitTextElementBox(
  element: Extract<SlideElement, { kind: "text" }>,
  stageAspect: number,
): ElementBox {
  const lines = (element.text || " ").split("\n");
  const maxWidth = Math.max(TEXT_MIN_W_PCT, Math.min(92, element.box.w));
  const lineWidths = lines.map((line) =>
    textLineWidthPct(line, element.style.fontSize, stageAspect),
  );
  const width =
    Math.min(maxWidth, Math.max(TEXT_MIN_W_PCT, ...lineWidths)) +
    AUTO_FIT_PADDING_PCT * 2;
  const wrappedLines = lineWidths.reduce(
    (sum, lineWidth) => sum + Math.max(1, Math.ceil(lineWidth / maxWidth)),
    0,
  );
  const height =
    wrappedLines * element.style.fontSize * 1.2 + AUTO_FIT_PADDING_PCT * 2;
  return positionFitWithinBox(
    element.box,
    clampFitSize(width, height, TEXT_MIN_W_PCT, TEXT_MIN_H_PCT),
    element.style.align,
  );
}

function fitBulletsElementBox(
  element: Extract<SlideElement, { kind: "bullets" }>,
  stageAspect: number,
): ElementBox {
  const bullets = element.bullets.length > 0 ? element.bullets : [" "];
  const maxWidth = Math.max(BULLETS_MIN_W_PCT, Math.min(92, element.box.w));
  const lineWidths = bullets.map((line) =>
    textLineWidthPct(line, element.style.fontSize, stageAspect),
  );
  const width =
    Math.min(maxWidth, Math.max(BULLETS_MIN_W_PCT, ...lineWidths) + 5) +
    AUTO_FIT_PADDING_PCT * 2;
  const wrappedLines = lineWidths.reduce(
    (sum, lineWidth) => sum + Math.max(1, Math.ceil(lineWidth / maxWidth)),
    0,
  );
  const height =
    wrappedLines * element.style.fontSize * 1.2 +
    Math.max(0, bullets.length - 1) * element.style.fontSize * 0.6 +
    AUTO_FIT_PADDING_PCT * 2;
  return positionFitWithinBox(
    element.box,
    clampFitSize(width, height, BULLETS_MIN_W_PCT, TEXT_MIN_H_PCT),
    element.style.align,
  );
}

function fitBoxToAspect(
  box: ElementBox,
  contentAspect: number,
  stageAspect: number,
): ElementBox {
  if (contentAspect <= 0 || !Number.isFinite(contentAspect)) {
    return box;
  }
  const boxAspect = (box.w / box.h) * stageAspect;
  const size =
    boxAspect > contentAspect
      ? { w: (box.h * contentAspect) / stageAspect, h: box.h }
      : { w: box.w, h: (box.w * stageAspect) / contentAspect };
  return positionFitWithinBox(
    box,
    clampFitSize(size.w, size.h, MIN_SIZE_PCT, SELECTION_MIN_H_PCT),
  );
}

function fitElementBoxToContent(
  element: SlideElement,
  visuals: ReadonlyMap<string, Visual>,
  stageAspect: number,
): ElementBox {
  switch (element.kind) {
    case "text":
      return fitTextElementBox(element, stageAspect);
    case "bullets":
      return fitBulletsElementBox(element, stageAspect);
    case "visual": {
      const visual = visuals.get(element.visualId);
      return visual
        ? fitBoxToAspect(element.box, visual.width / visual.height, stageAspect)
        : element.box;
    }
    case "shape":
      return element.shape === "line"
        ? positionFitWithinBox(element.box, {
            w: element.box.w,
            h: SELECTION_MIN_H_PCT,
          })
        : element.box;
    case "image":
      return element.box;
  }
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
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
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
  onUpdateElement,
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
  const accent = slide.accent ?? tc.accentColor;
  const stageAspect = width / height;
  const fittedBoxes = useMemo(() => {
    const map = new Map<string, ElementBox>();
    for (const element of elements) {
      map.set(
        element.id,
        fitElementBoxToContent(element, visuals, stageAspect),
      );
    }
    return map;
  }, [elements, stageAspect, visuals]);
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;
  const selectedElementBox = selectedElement
    ? (fittedBoxes.get(selectedElement.id) ?? selectedElement.box)
    : null;
  // Elements in the multi-selection that still exist on this slide, plus a
  // convenience flag for "2+ selected" (issue #237). The single-select path is
  // unchanged: a 1-element selection behaves exactly as before.
  const selectedElements = useMemo(
    () => elements.filter((element) => selectedElementIds.has(element.id)),
    [elements, selectedElementIds],
  );
  const isMultiSelect = selectedElements.length >= 2;
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
          .map((element) =>
            fitElementBoxToContent(element, visuals, stageAspect),
          );
        const { box, guides } = snapBox(moved, others, SNAP_THRESHOLD_PCT);
        setSnapGuides(guides);
        onUpdateElement(drag.id, { box }, drag.coalesceKey);
        return;
      }

      const next = applyResize(drag.startBox, drag.mode, dxPct, dyPct);
      onUpdateElement(drag.id, { box: clampBox(next) }, drag.coalesceKey);
    },
    [onUpdateElement, stageAspect, visuals],
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
            box: fitElementBoxToContent(element, visuals, stageAspect),
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
  }, [onSelectElement, onSelectElements, stageAspect, visuals]);

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
    activeDrag && selectedElementBox
      ? formatBadge(activeDrag, selectedElementBox)
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
          const fittedBox = fittedBoxes.get(element.id) ?? element.box;
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
                beginDrag(event, element.id, "move", fittedBox);
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
                left: `${fittedBox.x}%`,
                top: `${fittedBox.y}%`,
                width: `${fittedBox.w}%`,
                height: `${fittedBox.h}%`,
                zIndex: selected ? 1000 : element.zIndex + 1,
              }}
            >
              {isEditing && editable ? (
                <InlineTextEditor
                  element={element}
                  color={resolveTextColor(element, tc)}
                  accent={accent}
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
                        beginDrag(event, element.id, handle, fittedBox)
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
              left: `${(selectedElementBox?.x ?? 0) + (selectedElementBox?.w ?? 0) / 2}%`,
              top: `calc(${(selectedElementBox?.y ?? 0) + (selectedElementBox?.h ?? 0)}% + 6px)`,
              transform: "translateX(-50%)",
              zIndex: 1500,
            }}
          >
            {badge}
          </div>
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
// Inline text editor — a transparent `contentEditable` overlay that renders the
// element's rich-text runs in place, so entering edit mode is WYSIWYG (no style
// jump) and per-run bold / italic / color / link formatting is preserved on
// every keystroke instead of being flattened to plain text.
// ---------------------------------------------------------------------------

function InlineTextEditor({
  element,
  color,
  accent,
  stageHeight,
  onChange,
  onCommit,
}: {
  element: Extract<SlideElement, { kind: "text" | "bullets" }>;
  color: string;
  accent: string;
  stageHeight: number;
  onChange: (patch: ElementPatch) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Snapshot the element kind once so the live keystroke handler never depends
  // on the (changing) element prop — the DOM is the source of truth while the
  // overlay is mounted and its innerHTML is set exactly once below.
  const kind = element.kind;

  // Seed the editable surface with the rendered runs, then focus and select all
  // so a fresh edit replaces the content like the old textarea did. Bullets are
  // seeded as one `<div>` per line so each is a block the marker CSS can attach
  // to and so Enter creates a new bullet. Runs only on mount; deck updates flow
  // out (never back into the DOM) so the caret is never disturbed mid-edit.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (kind === "text") {
      node.innerHTML = runsToHtml(element.runs, element.text);
    } else {
      node.innerHTML =
        element.bullets.length > 0
          ? element.bullets
              .map(
                (bullet, i) =>
                  `<div>${runsToHtml(element.bulletRuns?.[i], bullet)}</div>`,
              )
              .join("")
          : "<div><br></div>";
    }
    node.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // Mount-only: intentionally not re-seeding on element changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitChange = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const { text, runs } = serializeRichText(node);
    if (kind === "text") {
      onChange({ text, runs: shouldStoreRuns(runs) ? runs : undefined });
      return;
    }
    const lines = splitRunsIntoLines(runs)
      .map((line) => ({
        text: line.text.replace(/\s+$/, ""),
        runs: mergeRuns(line.runs),
      }))
      .filter((line) => line.text.length > 0);
    const hasRichBullets = lines.some((line) => shouldStoreRuns(line.runs));
    onChange({
      bullets: lines.map((line) => line.text),
      bulletRuns: hasRichBullets ? lines.map((line) => line.runs) : undefined,
    });
  }, [kind, onChange]);

  const commit = useCallback(() => {
    emitChange();
    onCommit();
  }, [emitChange, onCommit]);

  const fontSizePx = (element.style.fontSize / 100) * stageHeight;

  // Mirror the static TextElementView / BulletsElementView text styles exactly
  // so entering edit mode is visually identical — no size / weight / line-height
  // jump. Vertical centering lives on the wrapper (below) to keep the editable
  // surface a plain block, which keeps caret / Enter behaviour predictable.
  const editableStyle = {
    width: "100%",
    color,
    fontSize: `${fontSizePx}px`,
    fontWeight: element.style.bold ? 700 : 400,
    fontStyle: element.style.italic ? "italic" : "normal",
    textAlign: element.style.align,
    lineHeight: kind === "text" ? 1.15 : 1.2,
    wordBreak: "break-word",
  } as CSSProperties & Record<string, string>;
  if (kind === "bullets") {
    editableStyle["--ds-bullet-accent"] = accent;
  }

  return (
    <div
      className="absolute inset-0 flex flex-col justify-center overflow-hidden"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        // A click in the padding around the text should still focus the editor
        // rather than do nothing.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          ref.current?.focus();
        }
      }}
    >
      <div
        ref={ref}
        role="textbox"
        aria-label={kind === "text" ? "Edit text" : "Edit bullets"}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        className={`outline-none${kind === "bullets" ? " ds-inline-bullets" : ""}`}
        style={editableStyle}
        onInput={emitChange}
        onBlur={commit}
        onPaste={(event) => {
          // Paste as plain text so external rich markup never leaks into the
          // runs; formatting stays under the editor's own controls.
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            commit();
            return;
          }
          // Inline bold / italic shortcuts; re-serialize so the runs persist.
          if ((event.metaKey || event.ctrlKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "b" || key === "i") {
              event.preventDefault();
              document.execCommand(key === "b" ? "bold" : "italic");
              emitChange();
            }
          }
        }}
      />
    </div>
  );
}
