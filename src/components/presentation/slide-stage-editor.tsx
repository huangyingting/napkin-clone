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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  Group,
  Lock,
  LockOpen,
  Pencil,
  RotateCw,
  Scissors,
  Trash2,
  Ungroup,
  type LucideIcon,
} from "lucide-react";

import {
  DECK_THEMES,
  SlideCanvas,
  type ThemeConfig,
} from "@/components/presentation/slide-canvas";
import { TextStyleBar } from "@/components/presentation/text-style-bar";
import { ColorPicker, DEFAULT_SWATCH_PRESETS } from "@/components/ui";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { cx, MENU_CHROME, MENU_ITEM } from "@/components/ui/tokens";
import type { ElementBox, Slide, SlideElement } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import { type SnapGuide, snapBox } from "@/lib/presentation/element-snap";
import { mergeSwatches } from "@/lib/presentation/text-style";
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
import {
  clientPointToStagePct,
  defaultTextBoxAtPoint,
} from "@/lib/presentation/canvas-helpers";
import type { Visual } from "@/lib/visual/schema";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DragMode = "move" | "rotate" | Handle;

interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBox: ElementBox;
  /** Coalesce key for the whole gesture so it forms one undo step (#242). */
  coalesceKey: string;
  /** True once the pointer has moved past the click threshold (a real drag). */
  moved: boolean;
  /** Font size at gesture start, for proportional corner scaling of text. */
  startFontSize?: number;
  /** Start boxes of all co-moving members for a group / multi-selection move. */
  groupBoxes?: { id: string; startBox: ElementBox }[];
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

// Pointer travel (px) below which a press-release on an element counts as a
// click (opens inline editing) rather than a drag (moves the element).
const CLICK_MOVE_THRESHOLD_PX = 4;

const MIN_SIZE_PCT = 4;
// Grid step (percent of slide) used when snap-to-grid is enabled.
const GRID_PCT = 2.5;

/**
 * Snap threshold in percent of the slide dimension (issue #225). Kept small so
 * snapping is a subtle assist and never fights a deliberate drag.
 */
const SNAP_THRESHOLD_PCT = 1.5;

const AUTO_FIT_PADDING_PCT = 1.2;
const TEXT_MIN_W_PCT = 10;
const BULLETS_MIN_W_PCT = 18;
const SELECTION_MIN_H_PCT = 4;
// Font-size bounds (percent of stage height) for corner-handle text scaling.
const MIN_FONT_PCT = 2;
const MAX_FONT_PCT = 30;

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
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
): ElementBox {
  // Canva model: the frame IS the element box — width is user-controlled, height
  // tracks the content (kept in sync by the editor / resize handlers). No
  // content-hug, so the editor selection always matches the static render.
  return element.box;
}

function contentHeightPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  fontSizePct: number,
  boxWidthPct: number,
  stageAspect: number,
): number {
  const lines =
    element.kind === "text"
      ? (element.text || " ").split("\n")
      : element.bullets.length > 0
        ? element.bullets
        : [" "];
  const minWidth =
    element.kind === "bullets" ? BULLETS_MIN_W_PCT : TEXT_MIN_W_PCT;
  const maxWidth = Math.max(minWidth, Math.min(92, boxWidthPct));
  const wrappedLines = lines.reduce((sum, line) => {
    const lineWidth = textLineWidthPct(line, fontSizePct, stageAspect);
    return sum + Math.max(1, Math.ceil(lineWidth / maxWidth));
  }, 0);
  let height = wrappedLines * fontSizePct * 1.2;
  if (element.kind === "bullets") {
    height += Math.max(0, lines.length - 1) * fontSizePct * 0.6;
  }
  return height;
}

/**
 * Canva-style resize for a text / bullets element.
 *
 * - **Side handles** (`e` / `w`) change the wrap width only; the font is
 *   untouched and the height auto-fits the re-wrapped content.
 * - **Corner handles** scale the font proportionally to the horizontal drag.
 * - **Top / bottom handles** (`n` / `s`) scale the font proportionally to the
 *   vertical drag (width scales with it), so every side has a useful grip.
 *
 * Height is always derived from the content; the opposite edge / corner is
 * anchored so the frame grows from where the user grabs it.
 */
function resizeTextBox(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  startBox: ElementBox,
  startFontSize: number,
  handle: Handle,
  dxPct: number,
  dyPct: number,
  stageAspect: number,
): { box: ElementBox; fontSize: number } {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const isCorner = handle.length === 2;
  const isVerticalOnly = !isCorner && (north || south);
  // Keep the frame at least as wide as the wrap-measurement minimum so the
  // auto-fit height never under-counts wrapped lines and clips text.
  const minWidth =
    element.kind === "bullets" ? BULLETS_MIN_W_PCT : TEXT_MIN_W_PCT;

  let width = startBox.w;
  let fontSize = startFontSize;

  if (isVerticalOnly) {
    // Vertical handle: proportional font scale driven by the vertical drag.
    const targetHeight = south ? startBox.h + dyPct : startBox.h - dyPct;
    const rawScale = startBox.h > 0 ? targetHeight / startBox.h : 1;
    fontSize = Math.min(
      MAX_FONT_PCT,
      Math.max(MIN_FONT_PCT, startFontSize * rawScale),
    );
    const scale = fontSize / startFontSize;
    width = Math.max(minWidth, Math.min(100, startBox.w * scale));
  } else {
    if (east) width = startBox.w + dxPct;
    else if (west) width = startBox.w - dxPct;
    width = Math.max(minWidth, Math.min(100, width));
    if (isCorner) {
      const targetScale = width / startBox.w;
      fontSize = Math.min(
        MAX_FONT_PCT,
        Math.max(MIN_FONT_PCT, startFontSize * targetScale),
      );
      const scale = fontSize / startFontSize;
      width = Math.max(minWidth, Math.min(100, startBox.w * scale));
    }
  }

  const height =
    contentHeightPct(element, fontSize, width, stageAspect) +
    AUTO_FIT_PADDING_PCT * 2;

  let x = startBox.x;
  if (west) x = startBox.x + startBox.w - width;
  else if (isVerticalOnly) x = startBox.x + (startBox.w - width) / 2;
  let y = startBox.y;
  if (north) y = startBox.y + startBox.h - height;

  return { box: clampBox({ x, y, w: width, h: height }), fontSize };
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
    case "bullets":
      return fitTextElementBox(element);
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
  /** Element operations surfaced by the floating toolbar + context menu. */
  onDuplicateElement: (id: string) => void;
  onRemoveElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onCopyElements: () => void;
  onCutElements: () => void;
  onPasteElements: () => void;
  onSetElementBoxes: (
    boxesById: Record<string, ElementBox>,
    coalesceKey?: string,
  ) => void;
  onGroupElements: (ids: string[]) => void;
  onUngroupElements: (groupId: string) => void;
  /** When true, element moves snap to a fixed grid. */
  snapToGrid?: boolean;
  /** The user's brand-kit colors, surfaced first in the element color pickers. */
  brandSwatches?: readonly string[];
  /**
   * Double-clicking the empty canvas creates a text element at the given box
   * and returns its new id (or null if creation failed). The caller owns the
   * deck mutation so it lands on the undo stack.
   */
  onAddTextElement?: (box: ElementBox) => string | null;
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
  onDuplicateElement,
  onRemoveElement,
  onBringToFront,
  onSendToBack,
  onCopyElements,
  onCutElements,
  onPasteElements,
  onSetElementBoxes,
  onGroupElements,
  onUngroupElements,
  snapToGrid = false,
  brandSwatches = [],
  onAddTextElement,
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
  // Right-click context menu: viewport coords + the element it targets.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId: string;
  } | null>(null);
  // Viewport point where an inline edit was opened by a single click, so the
  // editor can drop the caret there instead of selecting all. Null for
  // double-click / keyboard entry (which select all).
  const [pendingCaret, setPendingCaret] = useState<{
    x: number;
    y: number;
  } | null>(null);
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
  // rAF-throttle refs for `handlePointerMove`. The latest native pointermove
  // event is stashed here; a requestAnimationFrame is scheduled only once per
  // frame so the stage processes at most one move update per frame rather than
  // once per native pointer event (which can fire 60–1000 times/s on high-DPI
  // displays or styluses). Cancelled on drag end and on unmount.
  const rafIdRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<PointerEvent | null>(null);

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
  // The single primary selection that the floating toolbar attaches to.
  const primaryElement =
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
      // Stash the latest event and schedule a rAF if none is pending. This
      // coalesces bursts of native pointermove events (up to 1000/s on some
      // devices) down to one update per animation frame (~60/s), so dragging
      // an element does not dispatch a deck mutation on every raw event.
      pendingMoveRef.current = event;
      if (rafIdRef.current !== null) {
        return;
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const ev = pendingMoveRef.current;
        if (!ev) {
          return;
        }
        pendingMoveRef.current = null;

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
          const curX = ((ev.clientX - rect.left) / rect.width) * 100;
          const curY = ((ev.clientY - rect.top) / rect.height) * 100;
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
        const dxPct = ((ev.clientX - drag.startClientX) / rect.width) * 100;
        const dyPct = ((ev.clientY - drag.startClientY) / rect.height) * 100;

        // Promote the gesture to a real drag once the pointer travels past a few
        // pixels, so a plain click (no movement) can instead open inline editing.
        if (
          !drag.moved &&
          (Math.abs(ev.clientX - drag.startClientX) > CLICK_MOVE_THRESHOLD_PX ||
            Math.abs(ev.clientY - drag.startClientY) > CLICK_MOVE_THRESHOLD_PX)
        ) {
          drag.moved = true;
        }

        if (drag.mode === "rotate") {
          const cxPct = drag.startBox.x + drag.startBox.w / 2;
          const cyPct = drag.startBox.y + drag.startBox.h / 2;
          const centerX = rect.left + (cxPct / 100) * rect.width;
          const centerY = rect.top + (cyPct / 100) * rect.height;
          let deg =
            (Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180) /
              Math.PI +
            90;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          deg = Math.round(deg);
          if (deg > 180) deg -= 360;
          if (deg < -180) deg += 360;
          onUpdateElement(
            drag.id,
            { rotation: deg === 0 ? undefined : deg },
            drag.coalesceKey,
          );
          return;
        }

        if (drag.mode === "move") {
          // Snap the drag delta to the grid when enabled (keeps groups rigid).
          const mdx = snapToGrid
            ? Math.round(dxPct / GRID_PCT) * GRID_PCT
            : dxPct;
          const mdy = snapToGrid
            ? Math.round(dyPct / GRID_PCT) * GRID_PCT
            : dyPct;
          // Group / multi-selection move: translate every captured member by the
          // same delta in one batched, undoable mutation (no snapping).
          if (drag.groupBoxes && drag.groupBoxes.length > 1) {
            const boxesById: Record<string, ElementBox> = {};
            for (const { id: memberId, startBox } of drag.groupBoxes) {
              boxesById[memberId] = clampBox({
                ...startBox,
                x: startBox.x + mdx,
                y: startBox.y + mdy,
              });
            }
            onSetElementBoxes(boxesById, drag.coalesceKey);
            return;
          }
          if (snapToGrid) {
            const box = clampBox({
              ...drag.startBox,
              x: drag.startBox.x + mdx,
              y: drag.startBox.y + mdy,
            });
            setSnapGuides([]);
            onUpdateElement(drag.id, { box }, drag.coalesceKey);
            return;
          }
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

        // Resize. Text / bullets follow the Canva model: side handles change the
        // wrap width (height auto-fits, font unchanged); corner handles scale the
        // font proportionally (width scales with it, height auto-fits). Other
        // kinds get a free box resize.
        const resized = elementsRef.current.find((item) => item.id === drag.id);
        // Convert the screen-space drag into the element's local frame so resizing
        // a rotated element still grows along its own axes.
        let rdx = dxPct;
        let rdy = dyPct;
        const rot = resized?.rotation ?? 0;
        if (rot) {
          const dxPx = ev.clientX - drag.startClientX;
          const dyPx = ev.clientY - drag.startClientY;
          const a = (-rot * Math.PI) / 180;
          const lx = dxPx * Math.cos(a) - dyPx * Math.sin(a);
          const ly = dxPx * Math.sin(a) + dyPx * Math.cos(a);
          rdx = (lx / rect.width) * 100;
          rdy = (ly / rect.height) * 100;
        }
        if (
          resized &&
          (resized.kind === "text" || resized.kind === "bullets")
        ) {
          const { box, fontSize } = resizeTextBox(
            resized,
            drag.startBox,
            drag.startFontSize ?? resized.style.fontSize,
            drag.mode,
            rdx,
            rdy,
            stageAspect,
          );
          if (fontSize !== resized.style.fontSize) {
            onUpdateElement(
              drag.id,
              { box, style: { ...resized.style, fontSize } },
              drag.coalesceKey,
            );
          } else {
            onUpdateElement(drag.id, { box }, drag.coalesceKey);
          }
        } else {
          onUpdateElement(
            drag.id,
            { box: clampBox(applyResize(drag.startBox, drag.mode, rdx, rdy)) },
            drag.coalesceKey,
          );
        }
      });
    },
    [onUpdateElement, onSetElementBoxes, stageAspect, visuals, snapToGrid],
  );

  const startEditing = useCallback(
    (element: SlideElement, caret?: { x: number; y: number } | null) => {
      if (element.kind === "text" || element.kind === "bullets") {
        onSelectElement(element.id);
        setEditingId(element.id);
        setEditCoalesceKey(nextGestureKey("edit-text", element.id));
        setPendingCaret(caret ?? null);
      }
    },
    [nextGestureKey, onSelectElement],
  );

  const endDrag = useCallback(() => {
    // Cancel any pending rAF so a frame that fires after pointer-up does not
    // apply a stale move to a newly completed gesture.
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      pendingMoveRef.current = null;
    }
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
    // A plain click (no movement) on a text/bullets element drops straight into
    // inline editing with the caret at the click point — no double-click needed.
    const drag = dragRef.current;
    if (drag && drag.mode === "move" && !drag.moved) {
      const element = elementsRef.current.find((item) => item.id === drag.id);
      if (element && (element.kind === "text" || element.kind === "bullets")) {
        startEditing(element, {
          x: drag.startClientX,
          y: drag.startClientY,
        });
      }
    }
    dragRef.current = null;
    setActiveDrag(null);
    setSnapGuides([]);
  }, [onSelectElement, onSelectElements, stageAspect, visuals, startEditing]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      // Cancel any pending rAF to avoid stale callbacks after unmount or
      // when the listener re-subscribes with a new handlePointerMove identity.
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        pendingMoveRef.current = null;
      }
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
      // Capture the pointer so drag events keep arriving even when the pointer
      // leaves the browser viewport, preventing a stuck-drag state (#306).
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      const startElement = elementsRef.current.find((item) => item.id === id);
      const groupId = startElement?.groupId;
      // Selection: a grouped element selects its whole group; otherwise keep an
      // existing multi-selection (dragged element becomes primary) or collapse
      // to a single selection.
      if (mode === "move" && groupId) {
        const groupIds = elementsRef.current
          .filter((item) => item.groupId === groupId)
          .map((item) => item.id);
        onSelectElements(groupIds);
      } else {
        onSelectElement(id, selectedElementIds.has(id) ? "keep" : "replace");
      }
      // For a move, capture the start boxes of every co-moving member (the whole
      // group, or the current multi-selection) so they translate together.
      let groupBoxes: { id: string; startBox: ElementBox }[] | undefined;
      if (mode === "move") {
        const movingIds = new Set<string>([id]);
        if (groupId) {
          elementsRef.current.forEach((item) => {
            if (item.groupId === groupId) movingIds.add(item.id);
          });
        } else if (selectedElementIds.has(id)) {
          selectedElementIds.forEach((sid) => movingIds.add(sid));
        }
        if (movingIds.size > 1) {
          groupBoxes = [...movingIds].map((mid) => ({
            id: mid,
            startBox:
              elementsRef.current.find((item) => item.id === mid)?.box ?? box,
          }));
        }
      }
      dragRef.current = {
        id,
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBox: box,
        coalesceKey: nextGestureKey(mode === "move" ? "move" : "resize", id),
        moved: false,
        startFontSize:
          startElement &&
          (startElement.kind === "text" || startElement.kind === "bullets")
            ? startElement.style.fontSize
            : undefined,
        groupBoxes,
      };
      setActiveDrag(mode);
    },
    [nextGestureKey, onSelectElement, onSelectElements, selectedElementIds],
  );

  const stopEditing = useCallback(() => {
    setEditingId(null);
    setEditCoalesceKey(null);
    setPendingCaret(null);
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
      // Capture so marquee / background-click events keep arriving off-viewport (#306).
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
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

  // Double-click on the empty stage background (not an element) creates a text
  // element at the click point and immediately enters inline editing (#298).
  // Element double-clicks call stopPropagation so they never reach this handler.
  const handleStageDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (activeEditingId || !onAddTextElement) {
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
      const { x: xPct, y: yPct } = clientPointToStagePct(
        event.clientX,
        event.clientY,
        rect,
      );
      const box = defaultTextBoxAtPoint(xPct, yPct);
      const newId = onAddTextElement(box);
      if (newId) {
        setEditingId(newId);
        setEditCoalesceKey(nextGestureKey("edit-text", newId));
        setPendingCaret(null);
      }
    },
    [activeEditingId, nextGestureKey, onAddTextElement],
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
      onDoubleClick={handleStageDoubleClick}
    >
      <div className="pointer-events-none absolute inset-0">
        <SlideCanvas
          slide={slide}
          visuals={visuals}
          hiddenElementIds={hiddenElementIds}
          editable
        />
      </div>

      {/* Empty-state hint — only when the slide has no elements (#298).
          pointer-events-none so it never intercepts clicks or double-clicks. */}
      {elements.length === 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <p className="select-none text-center text-sm leading-relaxed text-ds-text-muted opacity-50">
            Click to add a title · Double-click to add text · Drag a visual here
          </p>
        </div>
      ) : null}

      {/* Interaction layer */}
      <div className="absolute inset-0">
        {snapToGrid ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(127,127,127,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(127,127,127,0.18) 1px, transparent 1px)",
              backgroundSize: `${GRID_PCT}% ${GRID_PCT}%`,
            }}
          />
        ) : null}
        {elements.map((element) => {
          const fittedBox = fittedBoxes.get(element.id) ?? element.box;
          const isPrimary = element.id === selectedElementId;
          const inSelection = selectedElementIds.has(element.id);
          const selected = isPrimary || inSelection;
          const isEditing = element.id === activeEditingId;
          const editable =
            element.kind === "text" || element.kind === "bullets";
          // Frame = the element box (Canva model). For text it equals fittedBox
          // anyway; the explicit element.box keeps the auto-growing height in
          // sync while editing.
          const containerBox = isEditing ? element.box : fittedBox;
          // Resize handles show for the primary selection — including while
          // editing text, so width / font can be adjusted without leaving the
          // caret. Ambiguous across a multi-selection, so single-only. Hidden
          // for locked elements.
          const showHandles = isPrimary && !isMultiSelect && !element.locked;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-label={elementAccessibleName(element)}
              aria-pressed={selected}
              onPointerDown={(event) => {
                if (isEditing || element.locked) {
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
                if (isEditing) {
                  return;
                }
                if (editable) {
                  event.stopPropagation();
                  startEditing(element);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectElement(
                  element.id,
                  selectedElementIds.has(element.id) ? "keep" : "replace",
                );
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  elementId: element.id,
                });
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
                left: `${containerBox.x}%`,
                top: `${containerBox.y}%`,
                width: `${containerBox.w}%`,
                height: `${containerBox.h}%`,
                zIndex: selected ? 1000 : element.zIndex + 1,
                ...(element.rotation
                  ? { transform: `rotate(${element.rotation}deg)` }
                  : {}),
              }}
            >
              {isEditing && editable ? (
                <InlineTextEditor
                  element={element}
                  color={resolveTextColor(element, tc)}
                  accent={accent}
                  stageHeight={height}
                  caretClient={pendingCaret}
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
              {showHandles && !isEditing ? (
                <span
                  onPointerDown={(event) =>
                    beginDrag(event, element.id, "rotate", fittedBox)
                  }
                  aria-hidden="true"
                  className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 touch-none items-center justify-center"
                  style={{ top: "calc(100% + 6px)", cursor: "grab" }}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-ds-control text-ds-control-text shadow">
                    <RotateCw size={11} aria-hidden="true" />
                  </span>
                </span>
              ) : null}
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

        {/* Contextual floating toolbar — single primary selection, hidden while
            dragging / resizing / marquee so it never jitters. */}
        {primaryElement && !isMultiSelect && !activeDrag && !marqueeRect ? (
          <FloatingElementToolbar
            key={primaryElement.id}
            stageRef={containerRef}
            box={fittedBoxes.get(primaryElement.id) ?? primaryElement.box}
          >
            <ElementToolbarContent
              element={primaryElement}
              tc={tc}
              brandSwatches={brandSwatches}
              onUpdateElement={onUpdateElement}
              onDuplicate={() => onDuplicateElement(primaryElement.id)}
              onBringToFront={() => onBringToFront(primaryElement.id)}
              onSendToBack={() => onSendToBack(primaryElement.id)}
              onRemove={() => onRemoveElement(primaryElement.id)}
            />
          </FloatingElementToolbar>
        ) : null}

        {/* Right-click context menu. */}
        {contextMenu ? (
          <ElementContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            element={
              elements.find((el) => el.id === contextMenu.elementId) ?? null
            }
            onClose={() => setContextMenu(null)}
            onEdit={(el) => startEditing(el)}
            onDuplicate={onDuplicateElement}
            onCopy={onCopyElements}
            onCut={onCutElements}
            onPaste={onPasteElements}
            onRemove={onRemoveElement}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onToggleLock={(id, locked) => onUpdateElement(id, { locked })}
            canGroup={selectedElementIds.size >= 2}
            onGroup={() => onGroupElements([...selectedElementIds])}
            onUngroup={onUngroupElements}
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
// Contextual floating toolbar + right-click context menu (Canva-style). Both
// portal to `document.body` so they escape the stage's `overflow:hidden`, and
// sit above the editor modal via an explicit z-index.
// ---------------------------------------------------------------------------

const OVERLAY_Z = 80;
const TOOLBAR_GAP = 10;

/** Positions its children as a fixed bar centered above (or below) `box`. */
function FloatingElementToolbar({
  stageRef,
  box,
  children,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  box: ElementBox;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: -1000,
    left: -1000,
  });
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const el = ref.current;
    if (!stage || !el) return;
    const rect = stage.getBoundingClientRect();
    const elTop = rect.top + (box.y / 100) * rect.height;
    const elBottom = rect.top + ((box.y + box.h) / 100) * rect.height;
    const elCenterX = rect.left + ((box.x + box.w / 2) / 100) * rect.width;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = elTop - h - TOOLBAR_GAP;
    if (top < 8) top = elBottom + TOOLBAR_GAP;
    let left = elCenterX - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    setPos({ top, left });
  }, [box.x, box.y, box.w, box.h, stageRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: OVERLAY_Z,
      }}
      className="flex items-center gap-1 rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay p-1 shadow-ds-popover"
    >
      {children}
    </div>,
    document.body,
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      <Icon size={14} aria-hidden="true" />
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px bg-ds-border-subtle" aria-hidden />;
}

/** The controls inside the floating toolbar, varying by element kind. */
function ElementToolbarContent({
  element,
  tc,
  brandSwatches,
  onUpdateElement,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onRemove,
}: {
  element: SlideElement;
  tc: ThemeConfig;
  brandSwatches: readonly string[];
  onUpdateElement: SlideStageEditorProps["onUpdateElement"];
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRemove: () => void;
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
  return (
    <>
      {element.kind === "text" || element.kind === "bullets" ? (
        <>
          <TextStyleBar
            variant="compact"
            style={element.style}
            colorPresets={textColorPresets}
            onChange={(style) => onUpdateElement(element.id, { style })}
          />
          <ToolbarDivider />
        </>
      ) : null}
      {element.kind === "shape" ? (
        <>
          <ColorPicker
            color={element.color}
            onChange={(color) => onUpdateElement(element.id, { color })}
            aria-label="Shape color"
            presets={shapeColorPresets}
          />
          <ToolbarDivider />
        </>
      ) : null}
      <ToolbarButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
      <ToolbarButton
        icon={ArrowUpToLine}
        label="Bring to front"
        onClick={onBringToFront}
      />
      <ToolbarButton
        icon={ArrowDownToLine}
        label="Send to back"
        onClick={onSendToBack}
      />
      <ToolbarButton icon={Trash2} label="Delete" onClick={onRemove} />
    </>
  );
}

/** Right-click menu of element actions, anchored at the pointer. */
function ElementContextMenu({
  x,
  y,
  element,
  onClose,
  onEdit,
  onDuplicate,
  onCopy,
  onCut,
  onPaste,
  onRemove,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  canGroup,
  onGroup,
  onUngroup,
}: {
  x: number;
  y: number;
  element: SlideElement | null;
  onClose: () => void;
  onEdit: (element: SlideElement) => void;
  onDuplicate: (id: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRemove: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  canGroup: boolean;
  onGroup: () => void;
  onUngroup: (groupId: string) => void;
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
  const editable = element.kind === "text" || element.kind === "bullets";
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
      onPointerDown={(event) => event.stopPropagation()}
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
      {editable ? item("Edit text", Pencil, () => onEdit(element)) : null}
      {item("Duplicate", Copy, () => onDuplicate(element.id))}
      {item("Copy", Copy, onCopy)}
      {item("Cut", Scissors, onCut)}
      {item("Paste", ClipboardPaste, onPaste)}
      <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
      {item("Bring to front", ArrowUpToLine, () => onBringToFront(element.id))}
      {item("Send to back", ArrowDownToLine, () => onSendToBack(element.id))}
      {canGroup ? item("Group", Group, onGroup) : null}
      {element.groupId
        ? item("Ungroup", Ungroup, () => onUngroup(element.groupId as string))
        : null}
      <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
      {item(
        element.locked ? "Unlock" : "Lock",
        element.locked ? LockOpen : Lock,
        () => onToggleLock(element.id, !element.locked),
      )}
      {item("Delete", Trash2, () => onRemove(element.id))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Inline text editor — a transparent `contentEditable` overlay that renders the
// element's rich-text runs in place, so entering edit mode is WYSIWYG (no style
// jump) and per-run bold / italic / color / link formatting is preserved on
// every keystroke instead of being flattened to plain text.
// ---------------------------------------------------------------------------

/**
 * Cross-browser caret range from a viewport point. Chrome / Safari expose
 * `caretRangeFromPoint`; Firefox uses the standard `caretPositionFromPoint`.
 * Returns `null` when neither is available or the point hits nothing.
 */
function caretRangeFromPoint(x: number, y: number): Range | null {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  const docWithCaret = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const pos = docWithCaret.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

function InlineTextEditor({
  element,
  color,
  accent,
  stageHeight,
  caretClient,
  onChange,
  onCommit,
}: {
  element: Extract<SlideElement, { kind: "text" | "bullets" }>;
  color: string;
  accent: string;
  stageHeight: number;
  caretClient: { x: number; y: number } | null;
  onChange: (patch: ElementPatch) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Snapshot the element kind once so the live keystroke handler never depends
  // on the (changing) element prop — the DOM is the source of truth while the
  // overlay is mounted and its innerHTML is set exactly once below.
  const kind = element.kind;
  // Snapshot the open-caret point once (mount only) so later renders never move
  // the caret while the user types.
  const caretRef = useRef(caretClient);

  const emitChange = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // Grow the box height to fit the live content (font size stays fixed) so a
    // multi-line edit expands the frame instead of clipping. The measured DOM
    // height is authoritative — more accurate than the static heuristic fit.
    const heightPct =
      (node.scrollHeight / stageHeight) * 100 + AUTO_FIT_PADDING_PCT * 2;
    const box = clampBox({ ...element.box, h: heightPct });
    const { text, runs } = serializeRichText(node);
    if (kind === "text") {
      onChange({ text, runs: shouldStoreRuns(runs) ? runs : undefined, box });
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
      box,
    });
  }, [kind, onChange, stageHeight, element.box]);

  const commit = useCallback(() => {
    emitChange();
    onCommit();
  }, [emitChange, onCommit]);

  // Seed the editable surface with the rendered runs, then place the caret: at
  // the click point for a single-click open, otherwise select all (double-click
  // / keyboard). Bullets are seeded as one `<div>` per line so each is a block
  // the marker CSS can attach to and so Enter creates a new bullet. Runs only on
  // mount; deck updates flow out (never back into the DOM) so the caret is never
  // disturbed mid-edit.
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
      const caret = caretRef.current;
      const pointRange = caret ? caretRangeFromPoint(caret.x, caret.y) : null;
      if (pointRange && node.contains(pointRange.startContainer)) {
        pointRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(pointRange);
      } else {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    // Fit the frame to the seeded content straight away.
    emitChange();
    // Mount-only: intentionally not re-seeding on element changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    ...(element.style.underline ? { textDecoration: "underline" } : {}),
    ...(element.style.fontFamily
      ? { fontFamily: element.style.fontFamily }
      : {}),
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
