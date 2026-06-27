"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ElementBox, SlideElement } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import type { Visual } from "@/lib/visual/schema";
import type { SnapGuide } from "@/lib/presentation/element-snap";
import { snapBox } from "@/lib/presentation/element-snap";
import type { HitTestCandidate } from "@/lib/presentation/stage-hit-test";
import {
  isStageTargetSelected,
  preselectionFromStageTarget,
  resolveStageElementTarget,
  resolveStageHitTarget,
  samePreselection,
  type StageInteractionTarget,
  type StagePreselection,
} from "@/lib/presentation/stage-targeting";
import { BOTTOM_HANDLES } from "@/components/presentation/slide-stage/resize-handles";
import type { ConnectorAnchorPreview } from "@/components/presentation/slide-stage/use-connector-editing";
import {
  boxesIntersectingRect,
  normalizeRect,
} from "@/lib/presentation/marquee-select";
import {
  rotateElementsAroundCenter,
  scaleElementsInBoundingBox,
} from "@/lib/presentation/selection-transform";
import {
  connectorAnchorCandidates,
  lineBoxFromEndpoints,
  resolveConnectorElementPoints,
  resolveLineEndpoints,
  snapLineEndpoint,
} from "@/lib/presentation/connector-geometry";
import {
  createTextResizeMeasurer,
  isAutoHeight,
} from "@/lib/presentation/text-element-fit";
import { shouldEnterInlineTextEditOnClick } from "@/lib/presentation/stage-interaction";
import {
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
import type { MarqueeRect } from "@/lib/presentation/marquee-select";

interface UseStageDragParams {
  containerRef: RefObject<HTMLDivElement | null>;
  elementsRef: RefObject<SlideElement[]>;
  fittedBoxes: ReadonlyMap<string, ElementBox>;
  visuals: ReadonlyMap<string, Visual>;
  stageAspect: number;
  snapToGrid: boolean;
  selectedElementId: string | null;
  selectedElementIds: ReadonlySet<string>;
  groupEditingId: string | null;
  activeEditingId: string | null;
  hitTestAtClientPoint: (
    clientX: number,
    clientY: number,
    options?: { selectedElementBonus?: boolean },
  ) => HitTestCandidate[];
  selectStageTarget: (
    target: StageInteractionTarget,
    mode?: "replace" | "toggle" | "keep",
  ) => void;
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onSetElementBoxes: (
    boxesById: Record<string, ElementBox>,
    coalesceKey?: string,
  ) => void;
  onSetElementPatches: (
    patchesById: Record<string, ElementPatch>,
    coalesceKey?: string,
  ) => void;
  onSelectElement: (id: string | null) => void;
  onSelectElements: (ids: string[], additive?: boolean) => void;
  nextGestureKey: (prefix: string, id: string) => string;
  startEditing: (
    element: SlideElement,
    caret?: { x: number; y: number } | null,
  ) => void;
  setAnchorPreview: React.Dispatch<
    React.SetStateAction<ConnectorAnchorPreview | null>
  >;
  setPreselectedTarget: React.Dispatch<
    React.SetStateAction<StagePreselection | null>
  >;
  // From useStageMarquee — passed as stable refs/setters to keep dep arrays identical.
  marqueeRef: React.MutableRefObject<MarqueeState | null>;
  marqueeRectRef: React.MutableRefObject<MarqueeRect | null>;
  setMarqueeRect: React.Dispatch<React.SetStateAction<MarqueeRect | null>>;
}

export interface UseStageDragResult {
  activeDrag: DragMode | null;
  multiActiveDrag: Handle | "rotate" | null;
  snapGuides: SnapGuide[];
  beginDrag: (
    event: React.PointerEvent,
    id: string,
    mode: DragMode,
    box: ElementBox,
  ) => void;
  beginMultiDrag: (
    event: React.PointerEvent,
    mode: Handle | "rotate",
    bbox: ElementBox,
  ) => void;
}

/**
 * Manages all pointer-driven drag interactions on the presentation stage:
 * element move, single-element resize/rotate, multi-selection bounding-box
 * resize/rotate, and marquee rubber-band selection.
 *
 * Owns `dragRef`, `multiDragRef`, `activeDrag`, `multiActiveDrag`,
 * `snapGuides`, and the rAF-throttle refs. Sets up and tears down global
 * `pointermove` / `pointerup` / `pointercancel` listeners via a `useEffect`.
 *
 * Reads marquee state through the refs returned by `useStageMarquee`; writes
 * connector anchor-preview state via the `setAnchorPreview` setter from
 * `useConnectorEditing`.
 */
export function useStageDrag({
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
}: UseStageDragParams): UseStageDragResult {
  const dragRef = useRef<DragState | null>(null);
  const multiDragRef = useRef<MultiDragState | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragMode | null>(null);
  const [multiActiveDrag, setMultiActiveDrag] = useState<
    Handle | "rotate" | null
  >(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  // rAF-throttle refs for `handlePointerMove`. The latest native pointermove
  // event is stashed here; a requestAnimationFrame is scheduled only once per
  // frame so the stage processes at most one move update per frame rather than
  // once per native pointer event (which can fire 60–1000 times/s on high-DPI
  // displays or styluses). Cancelled on drag end and on unmount.
  const rafIdRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<PointerEvent | null>(null);

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

        // Marquee selection takes precedence: while a band is being drawn there
        // is no element drag in flight (the two start from mutually exclusive
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
          // transforms from the original rather than accumulating rounding
          // errors.
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

        // Promote the gesture to a real drag once the pointer travels past a
        // few pixels, so a plain click (no movement) can instead open inline
        // editing.
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
          // Group / multi-selection move: translate every captured member by
          // the same delta in one batched, undoable mutation (no snapping).
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
                ...(moving?.kind === "shape" && moving.content.shape === "line"
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
              ...(moving?.kind === "shape" && moving.content.shape === "line"
                ? { connector: undefined }
                : {}),
            },
            drag.coalesceKey,
          );
          return;
        }

        // Resize. Text / bullets follow the Canva model: side handles change
        // the wrap width (height auto-fits, font unchanged); corner handles
        // scale the font proportionally (width scales with it, height
        // auto-fits). Other kinds get a free box resize.
        const resized = elementsRef.current.find((item) => item.id === drag.id);
        // Convert the screen-space drag into the element's local frame so
        // resizing a rotated element still grows along its own axes.
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
        if (resized && resized.kind === "text") {
          const textStyle = resized.designOverrides?.textStyle ?? {
            fontSize: 4,
            bold: false,
            italic: false,
            align: "left" as const,
          };
          const isFixed = resized.content.fitMode === "fixed-box";
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
              {
                box: newBox,
                ...(isAutoH
                  ? {
                      content: {
                        ...resized.content,
                        fitMode: "fixed-box" as const,
                      },
                    }
                  : {}),
              },
              drag.coalesceKey,
            );
          } else {
            // Auto-height (non-bottom handles) or shrink-to-fit: Canva-style
            // text resize where font scales with the box and height derives
            // from content.
            const { box, fontSize } = resizeTextBox(
              resized,
              drag.startBox,
              drag.startFontSize ?? textStyle.fontSize ?? 4,
              drag.mode,
              rdx,
              rdy,
              createTextResizeMeasurer(rect.width, rect.height),
            );
            if (fontSize !== (textStyle.fontSize ?? 4)) {
              onUpdateElement(
                drag.id,
                {
                  box,
                  designOverrides: {
                    ...resized.designOverrides,
                    textStyle: { ...textStyle, fontSize },
                  },
                },
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
                ? {
                    content: {
                      ...resized.content,
                      start: snapped.binding ?? snapped.point,
                    },
                  }
                : {
                    content: {
                      ...resized.content,
                      end: snapped.binding ?? snapped.point,
                    },
                  }),
            },
            drag.coalesceKey,
          );
        } else if (
          resized?.kind === "shape" &&
          resized.content.shape === "line" &&
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
              candidate.kind === "shape" && candidate.content.shape === "line"
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
            {
              box: clampBox(applyResize(drag.startBox, drag.mode, rdx, rdy)),
            },
            drag.coalesceKey,
          );
        }
      });
    },
    [
      activeEditingId,
      containerRef,
      elementsRef,
      groupEditingId,
      hitTestAtClientPoint,
      marqueeRectRef,
      marqueeRef,
      onUpdateElement,
      onSetElementBoxes,
      onSetElementPatches,
      setAnchorPreview,
      setMarqueeRect,
      setPreselectedTarget,
      stageAspect,
      visuals,
      snapToGrid,
    ],
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
  }, [
    elementsRef,
    marqueeRectRef,
    marqueeRef,
    onSelectElement,
    onSelectElements,
    setAnchorPreview,
    setMarqueeRect,
    stageAspect,
    visuals,
    startEditing,
  ]);

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
      // For a move, capture the start boxes of every co-moving member (the
      // whole group, or the current multi-selection) so they translate together.
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
          startElement && startElement.kind === "text"
            ? (startElement.designOverrides?.textStyle?.fontSize ?? 4)
            : undefined,
        groupBoxes,
        wasPrimarySelected,
        selectedCountAtStart: selectedElementIds.size,
      };
      setPreselectedTarget(null);
    },
    [
      groupEditingId,
      elementsRef,
      nextGestureKey,
      selectStageTarget,
      selectedElementId,
      selectedElementIds,
      setPreselectedTarget,
    ],
  );

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
    [
      containerRef,
      elementsRef,
      nextGestureKey,
      selectedElementIds,
      fittedBoxes,
    ],
  );

  return {
    activeDrag,
    multiActiveDrag,
    snapGuides,
    beginDrag,
    beginMultiDrag,
  };
}
