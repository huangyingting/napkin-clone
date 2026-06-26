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
} from "react";
import { RotateCw } from "lucide-react";

import { SlideCanvas } from "@/components/presentation/slide-canvas";
import type {
  ElementBox,
  Deck,
  Slide,
  SlideElement,
} from "@/lib/presentation/deck";
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
import {
  STAGE_CHROME_Z_INDEX,
  stageElementOverlayZIndex,
} from "@/lib/presentation/stage-chrome";
import { nextSelectUnderTarget } from "@/lib/presentation/stage-select-under";
import { selectionBoundingBox } from "@/lib/presentation/selection-transform";
import {
  CONNECTOR_ANCHORS,
  anchorPoint,
} from "@/lib/presentation/connector-geometry";
import { isAutoHeight } from "@/lib/presentation/text-element-fit";
import {
  elementPointerDownIntent,
  isInlineEditableStageElement,
  shouldClearSelectionOnStagePointerDown,
} from "@/lib/presentation/stage-interaction";
import {
  isStageTargetSelected,
  resolveStageElementTarget,
  resolveStageHitTarget,
  type StageInteractionTarget,
  type StagePreselection,
} from "@/lib/presentation/stage-targeting";
import {
  hitTestSlideElements,
  type MediaHitGeometry,
  type TextHitGeometry,
} from "@/lib/presentation/stage-hit-test";
import { buildMediaHitGeometry } from "@/lib/presentation/media-hit-geometry";
import { measureTextHitGeometry } from "@/lib/presentation/text-hit-geometry";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import { useGestureKey } from "@/lib/presentation/gesture-primitives";
import type { Visual } from "@/lib/visual/schema";

import {
  GRID_PCT,
  MARQUEE_THRESHOLD_PCT,
  fitElementBoxToContent,
  type DragMode,
} from "@/lib/presentation/stage-resize";
import { clientPointToStagePct } from "@/lib/presentation/canvas-helpers";

import {
  BOTTOM_HANDLES,
  ConnectorEndpointHandles,
  ElementFrameOverlay,
  HANDLES,
  LINE_HANDLES,
  MultiSelectBoundingBox,
} from "@/components/presentation/slide-stage/resize-handles";
import { InlineTextEditor } from "@/components/presentation/slide-stage/inline-text-editor";
import { ElementContextMenu } from "@/components/presentation/slide-stage/element-overlays";
import { useInlineTextEdit } from "@/components/presentation/slide-stage/use-inline-text-edit";
import { useStageMarquee } from "@/components/presentation/slide-stage/use-stage-marquee";
import { useConnectorEditing } from "@/components/presentation/slide-stage/use-connector-editing";
import { useStageDrag } from "@/components/presentation/slide-stage/use-stage-drag";

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
  /** Deck context for full cascade resolution (custom token set / masters). */
  deck: Deck;
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

const ELEMENT_ARIA_KEYSHORTCUTS =
  "Space Enter Delete Backspace ArrowLeft ArrowRight ArrowUp ArrowDown " +
  "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown " +
  "[ ] Shift+[ Shift+] C";

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
  const [preselectedTarget, setPreselectedTarget] =
    useState<StagePreselection | null>(null);
  // Monotonic gesture counter (issue #242). Each drag / resize / inline-edit
  // gesture derives a coalesce key with a unique suffix so consecutive gestures
  // of the same kind on the same element never merge into one undo step.
  const nextGestureKey = useGestureKey();

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

  // ── Extracted hooks ────────────────────────────────────────────────────────

  // 1. Inline text editing session.
  const {
    editCoalesceKey,
    pendingCaret,
    activeEditingId,
    editingElement,
    startEditing,
    stopEditing,
    handleStageDoubleClick,
  } = useInlineTextEdit({
    elements,
    selectedElementId,
    nextGestureKey,
    onSelectElement,
    onAddTextElement,
    containerRef,
  });

  // 2. Rubber-band marquee selection state.
  const {
    marqueeRef,
    marqueeRectRef,
    marqueeRect,
    setMarqueeRect,
    beginMarquee,
  } = useStageMarquee();

  // 3. Connector anchor-preview overlay + context-menu detach operations.
  const {
    anchorPreview,
    setAnchorPreview,
    handleDetachConnectorStart,
    handleDetachConnectorEnd,
  } = useConnectorEditing({ elements, onUpdateElement });

  // 4. All pointer drag operations: move, resize, rotate, multi-select.
  const { activeDrag, multiActiveDrag, snapGuides, beginDrag, beginMultiDrag } =
    useStageDrag({
      containerRef,
      elementsRef,
      fittedBoxes,
      visuals,
      stageAspect,
      snapToGrid,
      selectedElementId,
      selectedElementIds,
      groupEditingId,
      activeEditingId,
      hitTestAtClientPoint,
      selectStageTarget,
      onUpdateElement,
      onSetElementBoxes,
      onSetElementPatches,
      onSelectElement,
      onSelectElements,
      nextGestureKey,
      startEditing,
      setAnchorPreview,
      setPreselectedTarget,
      marqueeRef,
      marqueeRectRef,
      setMarqueeRect,
    });

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

  // ── Stage background handlers ──────────────────────────────────────────────

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
      beginMarquee(
        xPct,
        yPct,
        event.shiftKey || event.metaKey || event.ctrlKey,
      );
    },
    [activeEditingId, onSelectElement, stopEditing, beginMarquee],
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
          deck={deck}
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
              aria-keyshortcuts={ELEMENT_ARIA_KEYSHORTCUTS}
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
            onDetachConnectorStart={() =>
              handleDetachConnectorStart(contextMenu.elementId, () =>
                setContextMenu(null),
              )
            }
            onDetachConnectorEnd={() =>
              handleDetachConnectorEnd(contextMenu.elementId, () =>
                setContextMenu(null),
              )
            }
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
