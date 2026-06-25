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
  Layers,
  Link,
  Link2Off,
  Lock,
  LockOpen,
  Minus,
  Palette,
  Pencil,
  RotateCw,
  Scissors,
  Spline,
  Trash2,
  Ungroup,
  type LucideIcon,
} from "lucide-react";

import { SlideCanvas } from "@/components/presentation/slide-canvas";
import { TextStyleBar } from "@/components/presentation/text-style-bar";
import { ColorPicker, DEFAULT_SWATCH_PRESETS } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { cx, MENU_CHROME, MENU_ITEM } from "@/components/ui/tokens";
import type {
  BulletItem,
  ConnectorAnchor,
  ConnectorEndpoint,
  ElementBox,
  Deck,
  Slide,
  SlideElement,
  TextElementStyle,
} from "@/lib/presentation/deck";
import { normalizeBulletItems } from "@/lib/presentation/deck";
import {
  resolveSlideThemeColors,
  resolveSlideTokenSet,
  type SlideThemeColors,
} from "@/lib/presentation/style-cascade";
import {
  resolveRoleToken,
  type DeckThemeTokenSet,
} from "@/lib/presentation/deck-theme-tokens";
import { orderedElementIds } from "@/lib/presentation/canvas-a11y";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { detachConnectorEndpoint } from "@/lib/presentation/connector-lifecycle";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import { type SnapGuide, snapBox } from "@/lib/presentation/element-snap";
import { mergeSwatches } from "@/lib/presentation/text-style";
import {
  boxesIntersectingRect,
  normalizeRect,
  type MarqueeRect,
} from "@/lib/presentation/marquee-select";
import {
  STAGE_CHROME_Z_INDEX,
  stageElementOverlayZIndex,
} from "@/lib/presentation/stage-chrome";
import { nextSelectUnderTarget } from "@/lib/presentation/stage-select-under";
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
import {
  rotateElementsAroundCenter,
  scaleElementsInBoundingBox,
  selectionBoundingBox,
} from "@/lib/presentation/selection-transform";
import {
  CONNECTOR_ANCHORS,
  anchorPoint,
  connectorAnchorCandidates,
  lineBoxFromEndpoints,
  resolveConnectorElementPoints,
  resolveLineEndpoints,
  snapLineEndpoint,
} from "@/lib/presentation/connector-geometry";
import {
  createTextResizeMeasurer,
  isAutoHeight,
  type TextLikeElement,
} from "@/lib/presentation/text-element-fit";
import {
  elementPointerDownIntent,
  isInlineEditableStageElement,
  shouldClearSelectionOnStagePointerDown,
  shouldEnterInlineTextEditOnClick,
} from "@/lib/presentation/stage-interaction";
import {
  isStageTargetSelected,
  resolveStageElementTarget,
  resolveStageHitTarget,
  type StageInteractionTarget,
} from "@/lib/presentation/stage-targeting";
import {
  hitTestSlideElements,
  type MediaHitGeometry,
  type TextHitGeometry,
} from "@/lib/presentation/stage-hit-test";
import { buildMediaHitGeometry } from "@/lib/presentation/media-hit-geometry";
import { measureTextHitGeometry } from "@/lib/presentation/text-hit-geometry";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import type { Visual } from "@/lib/visual/schema";

import {
  AUTO_FIT_PADDING_PCT,
  CLICK_MOVE_THRESHOLD_PX,
  GRID_PCT,
  MARQUEE_THRESHOLD_PCT,
  MIN_SIZE_PCT,
  SNAP_THRESHOLD_PCT,
  applyResize,
  clampBox,
  fitElementBoxToContent,
  resizeTextBox,
  type DragMode,
  type DragState,
  type Handle,
  type MarqueeState,
  type MultiDragState,
} from "@/lib/presentation/stage-resize";

import {
  BOTTOM_HANDLES,
  ConnectorEndpointHandles,
  ElementFrameOverlay,
  HANDLES,
  LINE_HANDLES,
  MultiSelectBoundingBox,
} from "@/components/presentation/slide-stage/resize-handles";

function resolveTextColor(
  element: Extract<SlideElement, { kind: "text" | "bullets" | "shape" }>,
  tc: SlideThemeColors,
  tokenSet: DeckThemeTokenSet,
): string {
  if (element.kind === "text") {
    const role = element.textRole ?? (element.role === "title" ? "h1" : "body");
    return element.style.color ?? resolveRoleToken(tokenSet, role).color;
  }
  if (element.kind === "bullets") {
    const role = element.textRole ?? "bullet";
    return element.style.color ?? resolveRoleToken(tokenSet, role).color;
  }
  void tc;
  return element.textStyle?.color ?? contrastTextColor(element.color);
}

function contrastTextColor(hex: string): string {
  const raw = hex.replace("#", "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : raw;
  if (expanded.length < 6) return "#ffffff";
  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.58 ? "#18181b" : "#ffffff";
}

function defaultShapeTextStyle(): TextElementStyle {
  return {
    fontSize: SLIDE_TEXT_FONT_SIZE.text,
    bold: false,
    italic: false,
    align: "center" as const,
  };
}

/**
 * How a selection request should fold into the current selection. `"replace"`
 * (the default, plain click) selects just the one element; `"toggle"`
 * (shift/ctrl/cmd-click) adds or removes it from a multi-selection; `"keep"`
 * makes it the primary without disturbing an existing multi-selection (used when
 * starting a drag on an already-selected element). Issue #237.
 */
export type SelectionMode = "replace" | "toggle" | "keep";

type StagePreselection =
  | { kind: "element"; elementId: string }
  | { kind: "group"; groupId: string; elementIds: string[] };

function preselectionFromStageTarget(
  target: StageInteractionTarget,
): StagePreselection {
  return target.kind === "group"
    ? {
        kind: "group",
        groupId: target.groupId,
        elementIds: target.elementIds,
      }
    : { kind: "element", elementId: target.element.id };
}

function samePreselection(
  a: StagePreselection | null,
  b: StagePreselection | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "element" && b.kind === "element") {
    return a.elementId === b.elementId;
  }
  if (a.kind === "group" && b.kind === "group") {
    return (
      a.groupId === b.groupId &&
      a.elementIds.length === b.elementIds.length &&
      a.elementIds.every((id, index) => id === b.elementIds[index])
    );
  }
  return false;
}

interface SlideStageEditorProps {
  slide: Slide;
  /** Deck context for full cascade resolution (custom token set / masters). */
  deck?: Deck;
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
  /** Applies per-element patches atomically — used by multi-select transform (#329). */
  onSetElementPatches: (
    patchesById: Record<string, ElementPatch>,
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
  /**
   * When false (Simple mode) advanced controls are hidden: rotate handle,
   * bring-to-front / send-to-back in the floating toolbar, and lock / group /
   * z-order items in the context menu. Defaults to true so existing call-sites
   * that don't pass the prop keep today's full behaviour.
   */
  showAdvanced?: boolean;
  /**
   * Imperative focus restoration request (#532). When `nonce` changes the stage
   * focuses the element whose id matches `elementId`, or the canvas container
   * when `elementId` is `null`, so keyboard users are never dropped to page top
   * after a move / resize / delete / duplicate / group mutation.
   */
  focusRequest?: { elementId: string | null; nonce: number };
  /**
   * Polite screen-reader announcement (#533). When `nonce` changes the text is
   * surfaced in a visually-hidden `aria-live` region (selection / move / resize
   * / delete results).
   */
  liveMessage?: { text: string; nonce: number };
}

export function SlideStageEditor({
  slide,
  deck,
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
  onSetElementPatches,
  onGroupElements,
  onUngroupElements,
  snapToGrid = false,
  onAddTextElement,
  showAdvanced = true,
  focusRequest,
  liveMessage,
}: SlideStageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const multiDragRef = useRef<MultiDragState | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragMode | null>(null);
  const [multiActiveDrag, setMultiActiveDrag] = useState<
    Handle | "rotate" | null
  >(null);
  // In-flight marquee selection (issue #245). The ref drives the pointer math;
  // `marqueeRect` mirrors it for rendering the band; `marqueeRectRef` holds the
  // latest normalized rect so pointer-up can resolve the selection even when the
  // final move and the up arrive in the same frame.
  const marqueeRef = useRef<MarqueeState | null>(null);
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Group editing state (issue #330). When non-null, the user has "entered" this
  // group and pointer-down treats group members as individual elements.
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  // Right-click context menu: viewport coords + the element it targets.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId: string;
    candidateIds: string[];
  } | null>(null);
  // Viewport point where an inline edit was opened by a single click, so the
  // editor can drop the caret there instead of selecting all. Null for
  // double-click / keyboard entry (which select all).
  const [pendingCaret, setPendingCaret] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  // Anchor point preview overlays while dragging a connector endpoint.
  const [anchorPreview, setAnchorPreview] = useState<
    { elementId: string; hoveredAnchor: ConnectorAnchor | null }[] | null
  >(null);
  const [preselectedTarget, setPreselectedTarget] =
    useState<StagePreselection | null>(null);
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
  // Deterministic reading-order ids (#531). Drives the roving tabindex: the
  // selected primary is the single Tab stop, falling back to the first element
  // in reading order when nothing is selected so Tab enters the canvas at a
  // predictable place rather than walking every element in raw DOM order.
  const orderedIds = useMemo(() => orderedElementIds(elements), [elements]);
  const rovingTabId = selectedElementId ?? orderedIds[0] ?? null;
  // Live element list for the global pointer-move handler (which is memoized on
  // a stable identity and must not re-subscribe on every element change). The
  // ref is synced from an effect so it is never written during render.
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  // Focus restoration (#532). When the parent requests focus after a keyboard
  // mutation, move DOM focus to the target element (or the canvas container
  // when none remains) so keyboard users keep their place instead of being
  // dropped to the top of the page. Keyed on the request nonce so an identical
  // target id still re-focuses; the initial nonce (0) is ignored.
  const focusNonce = focusRequest?.nonce ?? 0;
  useLayoutEffect(() => {
    if (focusNonce === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const targetId = focusRequest?.elementId ?? null;
    if (targetId) {
      const node = container.querySelector<HTMLElement>(
        `[data-element-id="${CSS.escape(targetId)}"]`,
      );
      if (node) {
        node.focus();
        return;
      }
    }
    container.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the request nonce changes.
  }, [focusNonce]);
  const tc = resolveSlideThemeColors(deck, slide);
  const stageTokenSet = resolveSlideTokenSet(deck, slide);
  const accent = slide.accent ?? tc.accentColor;
  const stageAspect = width / height;
  const fittedBoxes = useMemo(() => {
    const map = new Map<string, ElementBox>();
    for (const element of elements) {
      map.set(
        element.id,
        fitElementBoxToContent(element, visuals, stageAspect, elements),
      );
    }
    return map;
  }, [elements, stageAspect, visuals]);
  const textHitGeometryRef = useRef<ReadonlyMap<string, TextHitGeometry>>(
    new Map(),
  );
  const mediaHitGeometryRef = useRef<ReadonlyMap<string, MediaHitGeometry>>(
    new Map(),
  );
  useLayoutEffect(() => {
    textHitGeometryRef.current = measureTextHitGeometry({
      elements,
      fittedBoxes,
      stageWidthPx: width,
      stageHeightPx: height,
    });
    mediaHitGeometryRef.current = buildMediaHitGeometry({
      elements,
      fittedBoxes,
      visuals,
    });
  }, [elements, fittedBoxes, height, visuals, width]);
  const hitTestAtClientPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      options: { selectedElementBonus?: boolean } = {},
    ) => {
      const container = containerRef.current;
      if (!container) return [];
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return [];
      }
      const point = clientPointToStagePct(clientX, clientY, rect);
      return hitTestSlideElements(point, elementsRef.current, {
        fittedBoxes,
        mediaHitGeometry: mediaHitGeometryRef.current,
        stageAspect,
        selectedElementBonus: options.selectedElementBonus,
        selectedElementIds,
        textHitGeometry: textHitGeometryRef.current,
      });
    },
    [fittedBoxes, selectedElementIds, stageAspect],
  );
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
  // Combined bounding box for the multi-selection (issue #329). Excludes locked
  // elements since they are not resized/rotated. Memoised so handle rendering
  // and pointer math always see the same box within a render cycle.
  const multiSelectBbox = useMemo(() => {
    if (!isMultiSelect) return null;
    const transformable = selectedElements.filter((el) => !el.locked);
    if (transformable.length < 2) return null;
    return selectionBoundingBox(
      transformable.map((el) => fittedBoxes.get(el.id) ?? el.box),
    );
  }, [isMultiSelect, selectedElements, fittedBoxes]);
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
        isInlineEditableStageElement(element),
    ) ?? null;
  const activeEditingId = editingElement?.id ?? null;
  const preselectedFrame = useMemo(() => {
    if (!preselectedTarget) return null;
    if (preselectedTarget.kind === "element") {
      const element = elements.find(
        (item) => item.id === preselectedTarget.elementId,
      );
      if (!element) return null;
      return {
        box: fittedBoxes.get(element.id) ?? element.box,
        rotation: element.rotation,
      };
    }
    const ids = new Set(preselectedTarget.elementIds);
    const boxes = elements
      .filter((element) => ids.has(element.id) && !element.locked)
      .map((element) => fittedBoxes.get(element.id) ?? element.box);
    if (boxes.length === 0) return null;
    return {
      box: selectionBoundingBox(boxes),
      rotation: undefined,
    };
  }, [elements, fittedBoxes, preselectedTarget]);
  const showSingleSelectedFrame =
    primaryElement !== null && !isMultiSelect && !marqueeRect;
  const selectedFrameBox =
    showSingleSelectedFrame && primaryElement
      ? primaryElement.id === activeEditingId
        ? primaryElement.box
        : (fittedBoxes.get(primaryElement.id) ?? primaryElement.box)
      : null;
  const showPreselectedFrame =
    preselectedFrame !== null &&
    !activeDrag &&
    !marqueeRect &&
    !activeEditingId;

  // Group bounding-box frame (issue #330). Shown when all selected elements share
  // a groupId but the group is not yet entered (groupEditingId is null).
  const activeGroupBbox = useMemo(() => {
    if (groupEditingId) return null;
    if (selectedElements.length < 2) return null;
    const gid = (selectedElements[0] as { groupId?: string }).groupId;
    if (!gid) return null;
    if (
      !selectedElements.every(
        (el) => (el as { groupId?: string }).groupId === gid,
      )
    )
      return null;
    const transformable = selectedElements.filter((el) => !el.locked);
    if (transformable.length === 0) return null;
    return selectionBoundingBox(
      transformable.map((el) => fittedBoxes.get(el.id) ?? el.box),
    );
  }, [groupEditingId, selectedElements, fittedBoxes]);

  const hiddenElementIds = useMemo(
    () =>
      editingElement &&
      (editingElement.kind === "text" || editingElement.kind === "bullets")
        ? new Set([editingElement.id])
        : undefined,
    [editingElement],
  );

  // Exit group editing on Escape (capture phase so it runs before slide-editor's
  // handler, preventing the selection from also being cleared).
  useEffect(() => {
    if (!groupEditingId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        // Re-select all group members and exit group editing.
        const members = elementsRef.current
          .filter(
            (el) => (el as { groupId?: string }).groupId === groupEditingId,
          )
          .map((el) => el.id);
        onSelectElements(members);
        setGroupEditingId(null);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [groupEditingId, onSelectElements]);

  const selectStageTarget = useCallback(
    (target: StageInteractionTarget, mode: SelectionMode = "replace") => {
      if (target.kind === "element") {
        onSelectElement(target.element.id, mode);
        return;
      }

      if (mode === "toggle") {
        const next = new Set(selectedElementIds);
        const allSelected = target.elementIds.every((id) => next.has(id));
        for (const id of target.elementIds) {
          if (allSelected) next.delete(id);
          else next.add(id);
        }
        onSelectElements([...next]);
        return;
      }

      if (
        mode === "keep" &&
        isStageTargetSelected(target, selectedElementIds)
      ) {
        return;
      }

      onSelectElements(target.elementIds);
    },
    [onSelectElement, onSelectElements, selectedElementIds],
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

        if ((ev.target as Element | null)?.closest("[data-floating-panel]")) {
          setPreselectedTarget((current) =>
            current === null ? current : null,
          );
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

        const hoveringInteraction =
          !activeEditingId &&
          marqueeRef.current === null &&
          multiDragRef.current === null &&
          dragRef.current === null;
        if (hoveringInteraction) {
          const hit =
            hitTestAtClientPoint(ev.clientX, ev.clientY, {
              selectedElementBonus: false,
            })[0] ?? null;
          const target = resolveStageHitTarget(hit, elementsRef.current, {
            groupEditingId,
          });
          const nextPreselection = target
            ? preselectionFromStageTarget(target)
            : null;
          setPreselectedTarget((current) =>
            samePreselection(current, nextPreselection)
              ? current
              : nextPreselection,
          );
        } else {
          setPreselectedTarget((current) =>
            current === null ? current : null,
          );
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

        // Multi-select bounding box resize / rotate (issue #329).
        const multiDrag = multiDragRef.current;
        if (multiDrag) {
          if (
            !multiDrag.moved &&
            (Math.abs(ev.clientX - multiDrag.startClientX) >
              CLICK_MOVE_THRESHOLD_PX ||
              Math.abs(ev.clientY - multiDrag.startClientY) >
                CLICK_MOVE_THRESHOLD_PX)
          ) {
            multiDrag.moved = true;
            setMultiActiveDrag(multiDrag.mode);
          }
          if (!multiDrag.moved) return;

          // Reconstruct each element from its start snapshot so every frame
          // transforms from the original rather than accumulating rounding errors.
          const startEls = multiDrag.elementStarts
            .map(({ id, startBox, startRotation }) => {
              const el = elementsRef.current.find((e) => e.id === id);
              if (!el) return null;
              const base = { ...el, box: startBox } as SlideElement;
              if (startRotation === 0) {
                delete (base as { rotation?: number }).rotation;
              } else {
                (base as { rotation?: number }).rotation = startRotation;
              }
              return base;
            })
            .filter((e): e is SlideElement => e !== null);

          if (multiDrag.mode === "rotate") {
            const cxPct = multiDrag.startBbox.x + multiDrag.startBbox.w / 2;
            const cyPct = multiDrag.startBbox.y + multiDrag.startBbox.h / 2;
            const centerXPx = rect.left + (cxPct / 100) * rect.width;
            const centerYPx = rect.top + (cyPct / 100) * rect.height;
            const currentAngle =
              (Math.atan2(ev.clientY - centerYPx, ev.clientX - centerXPx) *
                180) /
                Math.PI -
              90;
            let deltaAngle = currentAngle - multiDrag.startAngleDeg;
            if (ev.shiftKey) deltaAngle = Math.round(deltaAngle / 15) * 15;
            deltaAngle = Math.round(deltaAngle);
            const transformed = rotateElementsAroundCenter(
              startEls,
              cxPct,
              cyPct,
              deltaAngle,
            );
            const patchesById: Record<string, ElementPatch> = {};
            for (const el of transformed) {
              patchesById[el.id] = {
                box: el.box,
                rotation: el.rotation,
              };
            }
            onSetElementPatches(patchesById, multiDrag.coalesceKey);
          } else {
            // Resize: apply handle delta to the combined bbox, then scale each
            // element proportionally within the new box.
            const dxPct =
              ((ev.clientX - multiDrag.startClientX) / rect.width) * 100;
            const dyPct =
              ((ev.clientY - multiDrag.startClientY) / rect.height) * 100;
            const rawBbox = applyResize(
              multiDrag.startBbox,
              multiDrag.mode,
              dxPct,
              dyPct,
            );
            const newBbox: ElementBox = {
              x: rawBbox.x,
              y: rawBbox.y,
              w: Math.max(MIN_SIZE_PCT, rawBbox.w),
              h: Math.max(MIN_SIZE_PCT, rawBbox.h),
            };
            const transformed = scaleElementsInBoundingBox(
              startEls,
              multiDrag.startBbox,
              newBbox,
            );
            const boxesById: Record<string, ElementBox> = {};
            for (const el of transformed) {
              boxesById[el.id] = el.box;
            }
            onSetElementBoxes(boxesById, multiDrag.coalesceKey);
          }
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
          setActiveDrag(drag.mode);
        }

        if (drag.mode === "rotate") {
          const cxPct = drag.startBox.x + drag.startBox.w / 2;
          const cyPct = drag.startBox.y + drag.startBox.h / 2;
          const centerX = rect.left + (cxPct / 100) * rect.width;
          const centerY = rect.top + (cyPct / 100) * rect.height;
          // The rotate handle sits below the element (`top: 100% + 6px`), so a
          // pointer directly below the center means "no rotation". Offset the
          // raw pointer angle by -90° to anchor 0° to that bottom position;
          // using +90 (a top-handle assumption) flips the element by 180° the
          // instant it is grabbed.
          let deg =
            (Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180) /
              Math.PI -
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
            const moving = elementsRef.current.find(
              (element) => element.id === drag.id,
            );
            onUpdateElement(
              drag.id,
              {
                box,
                ...(moving?.kind === "shape" && moving.shape === "line"
                  ? { connector: undefined }
                  : {}),
              },
              drag.coalesceKey,
            );
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
              fitElementBoxToContent(
                element,
                visuals,
                stageAspect,
                elementsRef.current,
              ),
            );
          const { box, guides } = snapBox(moved, others, SNAP_THRESHOLD_PCT);
          setSnapGuides(guides);
          const moving = elementsRef.current.find(
            (element) => element.id === drag.id,
          );
          onUpdateElement(
            drag.id,
            {
              box,
              ...(moving?.kind === "shape" && moving.shape === "line"
                ? { connector: undefined }
                : {}),
            },
            drag.coalesceKey,
          );
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
          const isFixed = resized.fitMode === "fixed-box";
          const isAutoH = isAutoHeight(resized);
          if (isFixed || (isAutoH && BOTTOM_HANDLES.has(drag.mode))) {
            // Fixed-box: free box resize (content clips at stored boundary).
            // Auto-height + bottom handle: user is manually setting the height,
            // so switch to fixed-box and let the box grow freely (#333).
            const newBox = clampBox(
              applyResize(drag.startBox, drag.mode, rdx, rdy),
            );
            onUpdateElement(
              drag.id,
              { box: newBox, ...(isAutoH ? { fitMode: "fixed-box" } : {}) },
              drag.coalesceKey,
            );
          } else {
            // Auto-height (non-bottom handles) or shrink-to-fit: Canva-style
            // text resize where font scales with the box and height derives
            // from content.
            const { box, fontSize } = resizeTextBox(
              resized,
              drag.startBox,
              drag.startFontSize ?? resized.style.fontSize,
              drag.mode,
              rdx,
              rdy,
              createTextResizeMeasurer(rect.width, rect.height),
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
          }
        } else if (
          resized?.kind === "connector" &&
          (drag.mode === "w" || drag.mode === "e")
        ) {
          // Connector endpoint drag (issue #325).
          const currentPoint = {
            x: Math.max(
              0,
              Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100),
            ),
            y: Math.max(
              0,
              Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100),
            ),
          };
          const resolveBox = (candidate: SlideElement) =>
            fitElementBoxToContent(
              candidate,
              visuals,
              stageAspect,
              elementsRef.current,
            );
          const snapped = snapLineEndpoint(
            currentPoint,
            resized.id,
            elementsRef.current,
            resolveBox,
            stageAspect,
          );
          const previewTargets = connectorAnchorCandidates(
            currentPoint,
            resized.id,
            elementsRef.current,
            resolveBox,
            stageAspect,
          ).map((candidate) => ({
            elementId: candidate.elementId,
            hoveredAnchor:
              snapped.binding?.elementId === candidate.elementId
                ? snapped.binding.anchor
                : candidate.hoveredAnchor,
          }));
          setAnchorPreview(previewTargets.length > 0 ? previewTargets : null);
          // Resolve current start/end screen positions for bounding box update.
          const resolvedPts = resolveConnectorElementPoints(
            resized,
            elementsRef.current,
            resolveBox,
          );
          const startPt = drag.mode === "w" ? snapped.point : resolvedPts.start;
          const endPt = drag.mode === "e" ? snapped.point : resolvedPts.end;
          const newBoundingBox = clampBox({
            x: Math.min(startPt.x, endPt.x),
            y: Math.min(startPt.y, endPt.y),
            w: Math.max(MIN_SIZE_PCT, Math.abs(endPt.x - startPt.x)),
            h: Math.max(MIN_SIZE_PCT, Math.abs(endPt.y - startPt.y)),
          });
          onUpdateElement(
            drag.id,
            {
              box: newBoundingBox,
              ...(drag.mode === "w"
                ? { start: snapped.binding ?? snapped.point }
                : { end: snapped.binding ?? snapped.point }),
            },
            drag.coalesceKey,
          );
        } else if (
          resized?.kind === "shape" &&
          resized.shape === "line" &&
          (drag.mode === "w" || drag.mode === "e")
        ) {
          const currentPoint = {
            x: Math.max(
              0,
              Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100),
            ),
            y: Math.max(
              0,
              Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100),
            ),
          };
          const endpoints = resolveLineEndpoints(
            resized,
            elementsRef.current,
            (candidate) =>
              candidate.kind === "shape" && candidate.shape === "line"
                ? candidate.box
                : fitElementBoxToContent(
                    candidate,
                    visuals,
                    stageAspect,
                    elementsRef.current,
                  ),
            stageAspect,
          );
          const snapped = snapLineEndpoint(
            currentPoint,
            resized.id,
            elementsRef.current,
            (candidate) =>
              fitElementBoxToContent(
                candidate,
                visuals,
                stageAspect,
                elementsRef.current,
              ),
            stageAspect,
          );
          const start = drag.mode === "w" ? snapped.point : endpoints.start;
          const end = drag.mode === "e" ? snapped.point : endpoints.end;
          const { box: rawBox, rotation } = lineBoxFromEndpoints(
            start,
            end,
            drag.startBox.h,
            stageAspect,
          );
          const box = clampBox(rawBox);
          onUpdateElement(drag.id, { box, rotation }, drag.coalesceKey);
        } else {
          onUpdateElement(
            drag.id,
            { box: clampBox(applyResize(drag.startBox, drag.mode, rdx, rdy)) },
            drag.coalesceKey,
          );
        }
      });
    },
    [
      activeEditingId,
      groupEditingId,
      hitTestAtClientPoint,
      onUpdateElement,
      onSetElementBoxes,
      onSetElementPatches,
      stageAspect,
      visuals,
      snapToGrid,
    ],
  );

  const startEditing = useCallback(
    (element: SlideElement, caret?: { x: number; y: number } | null) => {
      if (isInlineEditableStageElement(element)) {
        onSelectElement(element.id);
        setEditingId(element.id);
        setEditCoalesceKey(nextGestureKey("edit-text", element.id));
        setPendingCaret(caret ?? null);
      }
    },
    [nextGestureKey, onSelectElement],
  );

  /**
   * Begins a multi-selection bounding-box resize or rotate gesture (issue #329).
   * Called from handle pointer-down events on the `MultiSelectBoundingBox`
   * overlay.  Captures the starting state of every transformable (non-locked)
   * selected element so pointer-move can apply transforms from the snapshot on
   * every frame without accumulating floating-point errors.
   */
  const beginMultiDrag = useCallback(
    (event: React.PointerEvent, mode: Handle | "rotate", bbox: ElementBox) => {
      event.stopPropagation();
      (event.currentTarget as Element).setPointerCapture(event.pointerId);

      const transformable = elementsRef.current.filter(
        (el) => selectedElementIds.has(el.id) && !el.locked,
      );

      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const cxPct = bbox.x + bbox.w / 2;
      const cyPct = bbox.y + bbox.h / 2;
      const centerXPx = rect
        ? rect.left + (cxPct / 100) * rect.width
        : event.clientX;
      const centerYPx = rect
        ? rect.top + (cyPct / 100) * rect.height
        : event.clientY;
      const startAngleDeg =
        (Math.atan2(event.clientY - centerYPx, event.clientX - centerXPx) *
          180) /
          Math.PI -
        90;

      multiDragRef.current = {
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBbox: bbox,
        elementStarts: transformable.map((el) => ({
          id: el.id,
          startBox: fittedBoxes.get(el.id) ?? el.box,
          startRotation: el.rotation ?? 0,
        })),
        startAngleDeg,
        coalesceKey: nextGestureKey(
          mode === "rotate" ? "multi-rotate" : "multi-resize",
          "sel",
        ),
        moved: false,
      };
    },
    [nextGestureKey, selectedElementIds, fittedBoxes],
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
            box: fitElementBoxToContent(
              element,
              visuals,
              stageAspect,
              elementsRef.current,
            ),
          })),
          finalRect,
        );
        onSelectElements(ids, marquee.additive);
      } else if (!marquee.additive) {
        onSelectElement(null);
      }
    }
    // A plain click on the already-selected primary text element enters inline
    // editing. The initial click on an unselected element only selects it.
    const drag = dragRef.current;
    if (drag) {
      const element = elementsRef.current.find((item) => item.id === drag.id);
      if (
        element &&
        shouldEnterInlineTextEditOnClick({
          element,
          mode: drag.mode,
          moved: drag.moved,
          wasPrimarySelected: drag.wasPrimarySelected,
          selectedCount: drag.selectedCountAtStart,
        })
      ) {
        startEditing(element, {
          x: drag.startClientX,
          y: drag.startClientY,
        });
      }
    }
    dragRef.current = null;
    multiDragRef.current = null;
    setActiveDrag(null);
    setMultiActiveDrag(null);
    setSnapGuides([]);
    setAnchorPreview(null);
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
      const startTarget = startElement
        ? resolveStageElementTarget(startElement, elementsRef.current, {
            groupEditingId,
          })
        : null;
      if (startTarget) {
        selectStageTarget(
          startTarget,
          isStageTargetSelected(startTarget, selectedElementIds)
            ? "keep"
            : "replace",
        );
      }
      // For a move, capture the start boxes of every co-moving member (the whole
      // group, or the current multi-selection) so they translate together.
      // In group-editing mode only the individual element moves.
      let groupBoxes: { id: string; startBox: ElementBox }[] | undefined;
      if (mode === "move") {
        const movingIds = new Set<string>([id]);
        if (startTarget?.kind === "group") {
          startTarget.elementIds.forEach((memberId) => movingIds.add(memberId));
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
      const wasPrimarySelected =
        selectedElementId === id && selectedElementIds.size === 1;
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
        wasPrimarySelected,
        selectedCountAtStart: selectedElementIds.size,
      };
      setPreselectedTarget(null);
    },
    [
      groupEditingId,
      nextGestureKey,
      selectStageTarget,
      selectedElementId,
      selectedElementIds,
    ],
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
      if (
        shouldClearSelectionOnStagePointerDown({
          activeEditingId,
          isPrimaryButton: event.button === 0,
        })
      ) {
        stopEditing();
        onSelectElement(null);
        return;
      }
      if (event.button !== 0) {
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
    [activeEditingId, onSelectElement, stopEditing],
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
      : multiActiveDrag && multiSelectBbox
        ? formatBadge(multiActiveDrag, multiSelectBbox)
        : null;

  return (
    <div
      ref={containerRef}
      data-slide-stage
      tabIndex={-1}
      className="relative isolate shrink-0 touch-none overflow-hidden bg-ds-surface-raised shadow-ds-overlay outline-none ring-1 ring-ds-border-strong"
      style={{ width, height }}
      onPointerDown={handleStagePointerDown}
      onDoubleClick={handleStageDoubleClick}
    >
      {/* Visually-hidden polite live region (#533): selection / move / resize /
          delete results announced to screen readers without visual noise. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage?.text ?? ""}
      </div>
      <div className="pointer-events-none absolute inset-0">
        <SlideCanvas
          slide={slide}
          {...(deck ? { deck } : {})}
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
          const editable = isInlineEditableStageElement(element);
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
              data-element-id={element.id}
              role="button"
              tabIndex={element.id === rovingTabId ? 0 : -1}
              aria-label={elementAccessibleName(element, elements)}
              aria-pressed={selected}
              onPointerDown={(event) => {
                const hits = hitTestAtClientPoint(event.clientX, event.clientY);
                const hit = hits[0];
                if (!hit) {
                  return;
                }
                if (event.altKey && hits.length > 1) {
                  event.preventDefault();
                  event.stopPropagation();
                  const target = nextSelectUnderTarget(
                    hits,
                    elementsRef.current,
                    { groupEditingId, selectedElementIds },
                  );
                  if (target) {
                    selectStageTarget(target, "replace");
                  }
                  return;
                }
                const target = resolveStageHitTarget(hit, elementsRef.current, {
                  groupEditingId,
                });
                if (!target) {
                  return;
                }
                const targetElement = target.element;
                if (targetElement.id !== element.id) {
                  event.stopPropagation();
                }
                if (
                  targetElement.id === activeEditingId ||
                  targetElement.locked
                ) {
                  return;
                }
                const pointerIntent = elementPointerDownIntent({
                  isSelected: isStageTargetSelected(target, selectedElementIds),
                  isAdditive: event.shiftKey || event.metaKey || event.ctrlKey,
                });
                if (pointerIntent === "toggle-selection") {
                  event.stopPropagation();
                  selectStageTarget(target, "toggle");
                  return;
                }
                // Unselected plain pointer-down still begins drag tracking:
                // pointer-up without movement selects only, while movement past
                // the click threshold moves immediately.
                beginDrag(event, targetElement.id, "move", hit.box);
              }}
              onDoubleClick={(event) => {
                const hit = hitTestAtClientPoint(
                  event.clientX,
                  event.clientY,
                )[0];
                if (!hit) {
                  return;
                }
                const target = resolveStageHitTarget(hit, elementsRef.current, {
                  groupEditingId,
                });
                if (!target) {
                  return;
                }
                const targetElement = target.element;
                if (targetElement.id !== element.id) {
                  event.stopPropagation();
                }
                if (targetElement.id === activeEditingId) {
                  return;
                }
                // Double-click on a grouped element (issue #330):
                // first double-click enters the group; inside the group, it
                // falls through to inline editing as normal.
                if (target.kind === "group") {
                  event.stopPropagation();
                  setGroupEditingId(target.groupId);
                  onSelectElement(targetElement.id, "replace");
                  return;
                }
                if (isInlineEditableStageElement(targetElement)) {
                  event.stopPropagation();
                  startEditing(targetElement);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const hits = hitTestAtClientPoint(event.clientX, event.clientY);
                const hit = hits[0];
                if (!hit) {
                  return;
                }
                const target = resolveStageHitTarget(hit, elementsRef.current, {
                  groupEditingId,
                });
                if (!target) {
                  return;
                }
                const targetElement = target.element;
                selectStageTarget(
                  target,
                  isStageTargetSelected(target, selectedElementIds)
                    ? "keep"
                    : "replace",
                );
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  elementId: targetElement.id,
                  candidateIds: hits.map((candidate) => candidate.element.id),
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  // Enter on a grouped element enters the group; inside the
                  // group it falls through to inline editing (issue #330).
                  const target = resolveStageElementTarget(element, elements, {
                    groupEditingId,
                  });
                  if (target.kind === "group") {
                    setGroupEditingId(target.groupId);
                    onSelectElement(element.id, "replace");
                  } else if (editable) {
                    startEditing(element);
                  }
                } else if (event.altKey && event.key === "]") {
                  event.preventDefault();
                  const point = {
                    x: fittedBox.x + fittedBox.w / 2,
                    y: fittedBox.y + fittedBox.h / 2,
                  };
                  const hits = hitTestSlideElements(point, elements, {
                    fittedBoxes,
                    mediaHitGeometry: mediaHitGeometryRef.current,
                    stageAspect,
                    selectedElementIds,
                    textHitGeometry: textHitGeometryRef.current,
                  });
                  const target = nextSelectUnderTarget(hits, elements, {
                    groupEditingId,
                    selectedElementIds,
                  });
                  if (target) {
                    selectStageTarget(target, "replace");
                  }
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
              }`}
              style={{
                left: `${containerBox.x}%`,
                top: `${containerBox.y}%`,
                width: `${containerBox.w}%`,
                height: `${containerBox.h}%`,
                zIndex: stageElementOverlayZIndex({
                  elementZIndex: element.zIndex,
                  selected,
                }),
                ...(element.rotation
                  ? { transform: `rotate(${element.rotation}deg)` }
                  : {}),
              }}
            >
              {isEditing && editable ? (
                <InlineTextEditor
                  element={element}
                  color={resolveTextColor(element, tc, stageTokenSet)}
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

              {showHandles ? (
                element.kind === "connector" ? (
                  /* Connector endpoint handles: positioned at actual start/end coords */ <ConnectorEndpointHandles
                    element={element}
                    elements={elements}
                    fittedBoxes={fittedBoxes}
                    onBeginDrag={(event, mode) =>
                      beginDrag(event, element.id, mode, fittedBox)
                    }
                  />
                ) : (
                  (element.kind === "shape" && element.shape === "line"
                    ? LINE_HANDLES
                    : HANDLES
                  ).map(({ handle, cursor, style }) => {
                    const dimmed =
                      BOTTOM_HANDLES.has(handle) &&
                      (element.kind === "text" || element.kind === "bullets") &&
                      isAutoHeight(element);
                    return (
                      <span
                        key={handle}
                        onPointerDown={(event) =>
                          beginDrag(event, element.id, handle, fittedBox)
                        }
                        aria-hidden="true"
                        className="absolute flex h-11 w-11 touch-none items-center justify-center"
                        style={{ ...style, cursor }}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full bg-ds-accent shadow transition-opacity ${
                            dimmed ? "opacity-40" : ""
                          }`}
                        />
                      </span>
                    );
                  })
                )
              ) : null}
              {showHandles && !isEditing && showAdvanced ? (
                <span
                  onPointerDown={(event) =>
                    beginDrag(event, element.id, "rotate", fittedBox)
                  }
                  aria-hidden="true"
                  className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 touch-none items-center justify-center"
                  style={{ top: "calc(100% + 6px)", cursor: "grab" }}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ds-accent text-ds-text-on-accent shadow">
                    <RotateCw size={11} aria-hidden="true" />
                  </span>
                </span>
              ) : null}
            </div>
          );
        })}

        {selectedFrameBox && primaryElement ? (
          <ElementFrameOverlay
            box={selectedFrameBox}
            rotation={primaryElement.rotation}
            variant="selected"
          />
        ) : null}

        {showPreselectedFrame && preselectedFrame ? (
          <ElementFrameOverlay
            box={preselectedFrame.box}
            rotation={preselectedFrame.rotation}
            variant="preselected"
          />
        ) : null}

        {/* Multi-selection bounding box — resize and rotate handles (issue #329).
            Shown when 2+ non-locked elements are selected and the user is not
            performing a marquee.  Hidden while a single-element drag is active
            so it does not jitter under the element being dragged. */}
        {multiSelectBbox && !marqueeRect && !activeDrag ? (
          <MultiSelectBoundingBox
            bbox={multiSelectBbox}
            showAdvanced={showAdvanced}
            onBeginDrag={beginMultiDrag}
          />
        ) : null}

        {/* Group bounding-box frame (issue #330). Shown when all selected
            elements share a groupId but the group has not been entered yet.
            Rendered below the multi-select handles so it doesn't intercept
            pointer events. */}
        {activeGroupBbox && !marqueeRect && !activeDrag ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: `${activeGroupBbox.x}%`,
              top: `${activeGroupBbox.y}%`,
              width: `${activeGroupBbox.w}%`,
              height: `${activeGroupBbox.h}%`,
              border: "2px dashed var(--ds-accent)",
              zIndex: STAGE_CHROME_Z_INDEX.groupFrame,
            }}
          >
            <span
              className="absolute -top-5 left-0 rounded-ds-sm bg-[var(--ds-accent-surface,#e0e7ff)] px-1 text-[10px] font-medium leading-5 text-[var(--ds-accent,#6366f1)]"
              style={{ whiteSpace: "nowrap" }}
            >
              Group
            </span>
          </div>
        ) : null}

        {/* Marquee (rubber-band) selection rectangle — issue #245. */}
        {marqueeRect &&
        (marqueeRect.w >= MARQUEE_THRESHOLD_PCT ||
          marqueeRect.h >= MARQUEE_THRESHOLD_PCT) ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-ds-accent bg-ds-accent/10"
            style={{
              left: `${marqueeRect.x}%`,
              top: `${marqueeRect.y}%`,
              width: `${marqueeRect.w}%`,
              height: `${marqueeRect.h}%`,
              zIndex: STAGE_CHROME_Z_INDEX.marquee,
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
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-ds-accent"
                  style={{
                    left: `${guide.position}%`,
                    zIndex: STAGE_CHROME_Z_INDEX.snapGuide,
                  }}
                />
              ) : (
                <div
                  key={`y-${guide.position}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 h-px bg-ds-accent"
                  style={{
                    top: `${guide.position}%`,
                    zIndex: STAGE_CHROME_Z_INDEX.snapGuide,
                  }}
                />
              ),
            )
          : null}

        {/* Connector anchor preview dots — shown while dragging a connector
            endpoint near candidate target elements. Five anchor points (center,
            top, bottom, left, right) appear on each candidate; the snapped
            anchor is highlighted in blue. */}
        {anchorPreview
          ? anchorPreview.flatMap((preview) => {
              const targetEl = elements.find(
                (el) => el.id === preview.elementId,
              );
              if (!targetEl) return [];
              const box = fittedBoxes.get(targetEl.id) ?? targetEl.box;
              return CONNECTOR_ANCHORS.map((anchor) => {
                const pt = anchorPoint(box, anchor);
                const isHovered = anchor === preview.hoveredAnchor;
                return (
                  <div
                    key={`${preview.elementId}:${anchor}`}
                    aria-hidden="true"
                    className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform ${
                      isHovered
                        ? "h-3.5 w-3.5 scale-125 bg-ds-accent shadow-md"
                        : "h-2.5 w-2.5 border border-ds-accent bg-ds-accent-surface shadow"
                    }`}
                    style={{
                      left: `${pt.x}%`,
                      top: `${pt.y}%`,
                      zIndex: STAGE_CHROME_Z_INDEX.connectorAnchorPreview,
                    }}
                  />
                );
              });
            })
          : null}

        {/* Live position / size badge */}
        {badge
          ? (() => {
              const badgeBox =
                multiActiveDrag && multiSelectBbox
                  ? multiSelectBbox
                  : selectedElementBox;
              return (
                <div
                  className="pointer-events-none absolute rounded-ds-sm bg-ds-inverse-surface px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ds-inverse-text"
                  style={{
                    left: `${(badgeBox?.x ?? 0) + (badgeBox?.w ?? 0) / 2}%`,
                    top: `calc(${(badgeBox?.y ?? 0) + (badgeBox?.h ?? 0)}% + 6px)`,
                    transform: "translateX(-50%)",
                    zIndex: STAGE_CHROME_Z_INDEX.liveBadge,
                  }}
                >
                  {badge}
                </div>
              );
            })()
          : null}

        {/* Right-click context menu. */}
        {contextMenu ? (
          <ElementContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            element={
              elements.find((el) => el.id === contextMenu.elementId) ?? null
            }
            allElements={elements}
            candidates={contextMenu.candidateIds
              .map((id) => elements.find((el) => el.id === id) ?? null)
              .filter((el): el is SlideElement => el !== null)}
            onClose={() => setContextMenu(null)}
            onSelectCandidate={(id) => {
              const candidate = elements.find((el) => el.id === id);
              if (!candidate) return;
              selectStageTarget(
                resolveStageElementTarget(candidate, elements, {
                  groupEditingId,
                }),
                "replace",
              );
            }}
            onEdit={(el) => startEditing(el)}
            onDuplicate={onDuplicateElement}
            onCopy={onCopyElements}
            onCut={onCutElements}
            onPaste={onPasteElements}
            onRemove={onRemoveElement}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onToggleLock={(id, locked) => onUpdateElement(id, { locked })}
            onDetachConnectorStart={() => {
              const el = elements.find((e) => e.id === contextMenu.elementId);
              if (el?.kind !== "connector") return;
              if (!("elementId" in el.start)) return;
              const free = detachConnectorEndpoint(
                el.start as ConnectorEndpoint,
                elements,
              );
              onUpdateElement(el.id, { start: free });
              setContextMenu(null);
            }}
            onDetachConnectorEnd={() => {
              const el = elements.find((e) => e.id === contextMenu.elementId);
              if (el?.kind !== "connector") return;
              if (!("elementId" in el.end)) return;
              const free = detachConnectorEndpoint(
                el.end as ConnectorEndpoint,
                elements,
              );
              onUpdateElement(el.id, { end: free });
              setContextMenu(null);
            }}
            canGroup={selectedElementIds.size >= 2}
            onGroup={() => onGroupElements([...selectedElementIds])}
            onUngroup={onUngroupElements}
            showAdvanced={showAdvanced}
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
  showAdvanced = true,
  compact = false,
}: {
  element: SlideElement;
  tc: SlideThemeColors;
  brandSwatches: readonly string[];
  onUpdateElement: SlideStageEditorProps["onUpdateElement"];
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRemove: () => void;
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
            icon={<Palette size={14} aria-hidden="true" />}
          />
          {element.shape !== "line" ? (
            <TextStyleBar
              variant="compact"
              style={element.textStyle ?? defaultShapeTextStyle()}
              colorPresets={textColorPresets}
              onChange={(textStyle) =>
                onUpdateElement(element.id, { textStyle })
              }
            />
          ) : null}
          <ToolbarDivider />
        </>
      ) : null}
      {element.kind === "connector" ? (
        <>
          <ToolbarButton
            icon={element.routing === "elbow" ? Minus : Spline}
            label={
              element.routing === "elbow" ? "Straight routing" : "Elbow routing"
            }
            onClick={() =>
              onUpdateElement(element.id, {
                routing: element.routing === "elbow" ? "straight" : "elbow",
              })
            }
          />
          <ToolbarButton
            icon={element.dash ? Link : Link2Off}
            label={element.dash ? "Solid line" : "Dashed line"}
            onClick={() => onUpdateElement(element.id, { dash: !element.dash })}
          />
          <ToolbarDivider />
        </>
      ) : null}
      <ToolbarButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
      {showAdvanced && !compact ? (
        <>
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
        </>
      ) : null}
      <ToolbarButton icon={Trash2} label="Delete" onClick={onRemove} />
    </>
  );
}

/** Right-click menu of element actions, anchored at the pointer. */
function ElementContextMenu({
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
  element: Extract<SlideElement, { kind: "text" | "bullets" | "shape" }>;
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

  // Per-item indent / listType metadata for bullets (#335).
  // Seeded from the element on mount, updated via Tab/Shift+Tab.
  const itemMetaRef = useRef<
    Array<{ indent: number; listType: "bullet" | "number" }>
  >([]);
  const dirtyRef = useRef(false);

  const emitChange = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // Auto-height mode: grow the box to fit the live content so a multi-line
    // edit expands the frame instead of clipping. Fixed-box and shrink-to-fit
    // keep the stored height; content is clipped or scaled by the renderer
    // (#333). Shapes never auto-grow (they have no fitMode).
    const autoH = kind !== "shape" && isAutoHeight(element as TextLikeElement);
    const box = autoH
      ? clampBox({
          ...element.box,
          h: Math.max(
            element.box.h,
            (node.scrollHeight / stageHeight) * 100 + AUTO_FIT_PADDING_PCT * 2,
          ),
        })
      : element.box;
    const { text, runs } = serializeRichText(node);
    if (kind === "text") {
      onChange({
        text,
        runs: shouldStoreRuns(runs) ? runs : undefined,
        ...(autoH ? { box } : {}),
      });
      return;
    }
    if (kind === "shape") {
      const trimmed = text.trim();
      onChange({
        text: trimmed.length > 0 ? text : undefined,
        textRuns:
          trimmed.length > 0 && shouldStoreRuns(runs) ? runs : undefined,
        textStyle: element.textStyle ?? defaultShapeTextStyle(),
      });
      return;
    }
    const lines = splitRunsIntoLines(runs)
      .map((line) => ({
        text: line.text.replace(/\s+$/, ""),
        runs: mergeRuns(line.runs),
      }))
      .filter((line) => line.text.length > 0);
    const hasRichBullets = lines.some((line) => shouldStoreRuns(line.runs));
    // Build items[] merging text/runs from DOM with indent/listType from meta ref.
    const meta = itemMetaRef.current;
    const hasMeta = meta.some((m) => m.indent !== 0 || m.listType !== "bullet");
    const items: BulletItem[] = lines.map((line, i) => ({
      text: line.text,
      ...(shouldStoreRuns(line.runs) ? { runs: line.runs } : {}),
      indent: meta[i]?.indent ?? 0,
      listType: meta[i]?.listType ?? "bullet",
    }));
    onChange({
      bullets: lines.map((line) => line.text),
      bulletRuns: hasRichBullets ? lines.map((line) => line.runs) : undefined,
      // Persist items[] whenever there's any indent/listType metadata (#335).
      ...(hasMeta || items.length !== lines.length ? { items } : {}),
      ...(autoH ? { box } : {}),
    });
  }, [kind, onChange, stageHeight, element]);

  const commit = useCallback(() => {
    if (dirtyRef.current) {
      emitChange();
    }
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
    } else if (kind === "shape") {
      node.innerHTML = runsToHtml(element.textRuns, element.text ?? "");
    } else {
      // Seed indent metadata from authoritative items (#335).
      const seedItems = normalizeBulletItems(element);
      itemMetaRef.current = seedItems.map((it) => ({
        indent: it.indent ?? 0,
        listType: it.listType ?? "bullet",
      }));
      node.innerHTML =
        seedItems.length > 0
          ? seedItems
              .map((item) => `<div>${runsToHtml(item.runs, item.text)}</div>`)
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
    // Mount-only: intentionally not re-seeding on element changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style =
    kind === "shape"
      ? (element.textStyle ?? defaultShapeTextStyle())
      : element.style;
  const fontSizePx = (style.fontSize / 100) * stageHeight;

  // Mirror the static TextElementView / BulletsElementView text styles exactly
  // so entering edit mode is visually identical — no size / weight / line-height
  // jump. Vertical centering lives on the wrapper (below) to keep the editable
  // surface a plain block, which keeps caret / Enter behaviour predictable.
  const editableStyle = {
    width: "100%",
    color,
    fontSize: `${fontSizePx}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textAlign: style.align,
    lineHeight: kind === "bullets" ? 1.2 : 1.15,
    wordBreak: "break-word",
    ...(style.underline ? { textDecoration: "underline" } : {}),
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
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
        aria-label={
          kind === "bullets"
            ? "Edit bullets"
            : kind === "shape"
              ? "Edit shape text"
              : "Edit text"
        }
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        className={`outline-none${kind === "bullets" ? " ds-inline-bullets" : ""}`}
        style={editableStyle}
        onInput={() => {
          dirtyRef.current = true;
          emitChange();
        }}
        onBlur={commit}
        onPaste={(event) => {
          // Paste as plain text so external rich markup never leaks into the
          // runs; formatting stays under the editor's own controls.
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          dirtyRef.current = true;
          emitChange();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            commit();
            return;
          }
          // Tab / Shift+Tab in bullet editing: change indent of current item (#335).
          if (kind === "bullets" && event.key === "Tab") {
            event.preventDefault();
            const node = ref.current;
            const sel = window.getSelection();
            if (node && sel && sel.rangeCount > 0) {
              let cursor: Node | null = sel.getRangeAt(0).startContainer;
              // Walk up to find the direct child <div> of the editable root.
              while (cursor && cursor.parentNode !== node) {
                cursor = cursor.parentNode;
              }
              if (cursor) {
                const divs = Array.from(node.children);
                const lineIdx = divs.indexOf(cursor as Element);
                if (lineIdx >= 0) {
                  const meta = itemMetaRef.current;
                  // Ensure entry exists.
                  if (!meta[lineIdx]) {
                    meta[lineIdx] = { indent: 0, listType: "bullet" };
                  }
                  const cur = meta[lineIdx].indent;
                  meta[lineIdx] = {
                    ...meta[lineIdx],
                    indent: event.shiftKey
                      ? Math.max(0, cur - 1)
                      : Math.min(5, cur + 1),
                  };
                  dirtyRef.current = true;
                  emitChange();
                }
              }
            }
            return;
          }
          // Inline bold / italic shortcuts; re-serialize so the runs persist.
          if ((event.metaKey || event.ctrlKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "b" || key === "i") {
              event.preventDefault();
              document.execCommand(key === "b" ? "bold" : "italic");
              dirtyRef.current = true;
              emitChange();
            }
          }
        }}
      />
    </div>
  );
}
