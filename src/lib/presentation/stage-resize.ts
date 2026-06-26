import type { ElementBox, SlideElement } from "./deck-elements";
import type { Visual } from "@/lib/visual/schema";
import {
  resolveLineEndpoints,
  lineBoxFromEndpoints,
} from "./connector-geometry";
import { textFitPaddingPct, type TextResizeMeasurer } from "./text-element-fit";
import { assertNever } from "@/lib/assert-never";

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type DragMode = "move" | "rotate" | Handle;

export interface DragState {
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
  /** True when this pointer-down began on the single primary selection. */
  wasPrimarySelected: boolean;
  /** Selection size at pointer-down; used to avoid entering edit from a group. */
  selectedCountAtStart: number;
}

/**
 * Drag state for a multi-selection bounding-box resize or rotate gesture
 * (issue #329).  Tracks the combined box at gesture start, the per-element
 * start state (box + rotation), and — for rotate — the angle between the
 * pointer and the selection center at gesture start so deltas are computed from
 * the original rather than accumulated each frame.
 */
export interface MultiDragState {
  mode: Handle | "rotate";
  startClientX: number;
  startClientY: number;
  /** Combined bounding box of all transformable elements at gesture start. */
  startBbox: ElementBox;
  /** Per-element starting state (for applying transforms from the original). */
  elementStarts: { id: string; startBox: ElementBox; startRotation: number }[];
  /** Angle (degrees) from selection center to pointer at drag start, for rotate. */
  startAngleDeg: number;
  coalesceKey: string;
  moved: boolean;
}

/**
 * In-flight marquee (rubber-band) selection (issue #245). Records where on the
 * stage (in percent) the band started and whether the gesture is additive
 * (shift/ctrl/cmd held at pointer-down, so the result unions with the existing
 * selection). The live rectangle is tracked separately for rendering.
 */
export interface MarqueeState {
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
export const MARQUEE_THRESHOLD_PCT = 1;

// Pointer travel (px) below which a press-release on an element counts as a
// click (opens inline editing) rather than a drag (moves the element).
export const CLICK_MOVE_THRESHOLD_PX = 4;

export const MIN_SIZE_PCT = 4;
// Grid step (percent of slide) used when snap-to-grid is enabled.
export const GRID_PCT = 2.5;

/**
 * Snap threshold in percent of the slide dimension (issue #225). Kept small so
 * snapping is a subtle assist and never fights a deliberate drag.
 */
export const SNAP_THRESHOLD_PCT = 1.5;

export const AUTO_FIT_PADDING_PCT = 1.2;
export const TEXT_MIN_W_PCT = 10;
export const BULLETS_MIN_W_PCT = 18;
export const SELECTION_MIN_H_PCT = 4;
// Font-size bounds (percent of stage height) for corner-handle text scaling.
export const MIN_FONT_PCT = 2;
export const MAX_FONT_PCT = 30;
// Granularity for drag-to-scale text: the font size snaps to 0.5 steps so the
// value stays tidy instead of landing on arbitrary fractions.
export const FONT_STEP_PCT = 0.5;

export function snapFontSize(value: number): number {
  return Math.min(
    MAX_FONT_PCT,
    Math.max(MIN_FONT_PCT, Math.round(value / FONT_STEP_PCT) * FONT_STEP_PCT),
  );
}

export function clampBox(box: ElementBox): ElementBox {
  const w = Math.max(MIN_SIZE_PCT, Math.min(100, box.w));
  const h = Math.max(MIN_SIZE_PCT, Math.min(100, box.h));
  const x = Math.max(0, Math.min(100 - w, box.x));
  const y = Math.max(0, Math.min(100 - h, box.y));
  return { x, y, w, h };
}

export function clampFitSize(
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

export function positionFitWithinBox(
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

export function fitTextElementBox(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
): ElementBox {
  // Canva model: the frame IS the element box — width is user-controlled, height
  // tracks the content (kept in sync by the editor / resize handlers). No
  // content-hug, so the editor selection always matches the static render.
  return element.box;
}

export function fitTextHeightPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  fontSizePct: number,
  boxWidthPct: number,
  measurer: TextResizeMeasurer,
): number {
  return (
    measurer.measureHeightPct(element, boxWidthPct, fontSizePct) +
    textFitPaddingPct(element, fontSizePct)
  );
}

/**
 * Smallest frame width (percent) that still fits the widest unbreakable word
 * without clipping it off the right edge. The renderer can wrap between words
 * but a single word that is wider than its column overflows (it is clipped by
 * the element's `overflow: hidden`), so a horizontal resize must not shrink the
 * frame below this. Bullets add the marker + gap indent to the requirement.
 */
export function minContentWidthPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  fontSizePct: number,
  measurer: TextResizeMeasurer,
): number {
  return measurer.measureMinWidthPct(element, fontSizePct);
}

export function availableWidthPct(startBox: ElementBox, west: boolean): number {
  return west ? startBox.x + startBox.w : 100 - startBox.x;
}

export function availableHeightPct(
  startBox: ElementBox,
  north: boolean,
): number {
  return north ? startBox.y + startBox.h : 100 - startBox.y;
}

export function minWidthForFontPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  fontSizePct: number,
  maxWidthPct: number,
  measurer: TextResizeMeasurer,
): number {
  return Math.max(
    element.kind === "bullets" ? BULLETS_MIN_W_PCT : TEXT_MIN_W_PCT,
    Math.min(maxWidthPct, minContentWidthPct(element, fontSizePct, measurer)),
  );
}

export function minWidthThatFitsHeightPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  fontSizePct: number,
  minWidthPct: number,
  maxWidthPct: number,
  maxHeightPct: number,
  measurer: TextResizeMeasurer,
): number {
  if (
    fitTextHeightPct(element, fontSizePct, minWidthPct, measurer) <=
    maxHeightPct
  ) {
    return minWidthPct;
  }
  if (
    fitTextHeightPct(element, fontSizePct, maxWidthPct, measurer) > maxHeightPct
  ) {
    return maxWidthPct;
  }
  let low = minWidthPct;
  let high = maxWidthPct;
  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2;
    if (fitTextHeightPct(element, fontSizePct, mid, measurer) <= maxHeightPct) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return high;
}

export function largestFontForFixedWidthPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  requestedFontPct: number,
  widthPct: number,
  maxHeightPct: number,
  measurer: TextResizeMeasurer,
): number {
  const minStep = Math.ceil(MIN_FONT_PCT / FONT_STEP_PCT);
  const maxStep = Math.floor(
    Math.min(MAX_FONT_PCT, requestedFontPct) / FONT_STEP_PCT,
  );
  let low = minStep;
  let high = Math.max(minStep, maxStep);
  let best = MIN_FONT_PCT;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const fontSize = mid * FONT_STEP_PCT;
    const widthFits =
      minContentWidthPct(element, fontSize, measurer) <= widthPct;
    const heightFits =
      fitTextHeightPct(element, fontSize, widthPct, measurer) <= maxHeightPct;
    if (widthFits && heightFits) {
      best = fontSize;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

export function cornerWidthForFontPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  startBox: ElementBox,
  startFontSize: number,
  fontSizePct: number,
  maxWidthPct: number,
  measurer: TextResizeMeasurer,
): number {
  const scaledWidth = startBox.w * (fontSizePct / startFontSize);
  return Math.min(
    maxWidthPct,
    Math.max(
      element.kind === "bullets" ? BULLETS_MIN_W_PCT : TEXT_MIN_W_PCT,
      scaledWidth,
      minContentWidthPct(element, fontSizePct, measurer),
    ),
  );
}

export function largestFontForCornerPct(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  startBox: ElementBox,
  startFontSize: number,
  requestedFontPct: number,
  maxWidthPct: number,
  maxHeightPct: number,
  measurer: TextResizeMeasurer,
): number {
  const minStep = Math.ceil(MIN_FONT_PCT / FONT_STEP_PCT);
  const maxStep = Math.floor(
    Math.min(MAX_FONT_PCT, requestedFontPct) / FONT_STEP_PCT,
  );
  let low = minStep;
  let high = Math.max(minStep, maxStep);
  let best = MIN_FONT_PCT;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const fontSize = mid * FONT_STEP_PCT;
    const minWidth = minContentWidthPct(element, fontSize, measurer);
    const width = cornerWidthForFontPct(
      element,
      startBox,
      startFontSize,
      fontSize,
      maxWidthPct,
      measurer,
    );
    const fits =
      minWidth <= maxWidthPct &&
      fitTextHeightPct(element, fontSize, width, measurer) <= maxHeightPct;
    if (fits) {
      best = fontSize;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/**
 * Canva-style resize for a text / bullets element.
 *
 * - **Side handles** (`e` / `w`) change the wrap width only; the font is
 *   untouched and the height auto-fits the re-wrapped content.
 * - **Corner handles** scale the font proportionally to the horizontal drag,
 *   growing width as needed to satisfy the measured min-content width.
 * - **Top / bottom handles** (`n` / `s`) scale the font from vertical drag while
 *   preserving width, stopping when the measured content no longer fits.
 *
 * Height is always derived from the content; the opposite edge / corner is
 * anchored so the frame grows from where the user grabs it. Text measurement is
 * delegated to an off-screen DOM node that mirrors the slide renderer, avoiding
 * canvas/character heuristics and post-render corrections.
 */
export function resizeTextBox(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  startBox: ElementBox,
  startFontSize: number,
  handle: Handle,
  dxPct: number,
  dyPct: number,
  measurer: TextResizeMeasurer,
): { box: ElementBox; fontSize: number } {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const isCorner = handle.length === 2;
  const isVerticalOnly = !isCorner && (north || south);
  const maxWidth = availableWidthPct(startBox, west);
  const maxHeight = availableHeightPct(startBox, north);

  let width = startBox.w;
  let fontSize = startFontSize;

  if (isVerticalOnly) {
    // Top/bottom handles scale font only. The current width is fixed, so the
    // font stops growing once browser layout says the longest word or total
    // natural height no longer fits in that width.
    const targetHeight = south ? startBox.h + dyPct : startBox.h - dyPct;
    const rawScale = startBox.h > 0 ? targetHeight / startBox.h : 1;
    fontSize = largestFontForFixedWidthPct(
      element,
      snapFontSize(startFontSize * rawScale),
      width,
      maxHeight,
      measurer,
    );
  } else {
    if (east) width = startBox.w + dxPct;
    else if (west) width = startBox.w - dxPct;
    width = Math.max(0, Math.min(maxWidth, width));
    if (isCorner) {
      const targetScale = width / startBox.w;
      fontSize = largestFontForCornerPct(
        element,
        startBox,
        startFontSize,
        snapFontSize(startFontSize * targetScale),
        maxWidth,
        maxHeight,
        measurer,
      );
      width = cornerWidthForFontPct(
        element,
        startBox,
        startFontSize,
        fontSize,
        maxWidth,
        measurer,
      );
    }
  }

  let minWidth = minWidthForFontPct(element, fontSize, maxWidth, measurer);
  width = Math.min(maxWidth, Math.max(width, minWidth));
  width = minWidthThatFitsHeightPct(
    element,
    fontSize,
    width,
    maxWidth,
    maxHeight,
    measurer,
  );

  let height = fitTextHeightPct(element, fontSize, width, measurer);
  if (height > maxHeight && fontSize > MIN_FONT_PCT) {
    fontSize = isCorner
      ? largestFontForCornerPct(
          element,
          startBox,
          startFontSize,
          fontSize,
          maxWidth,
          maxHeight,
          measurer,
        )
      : largestFontForFixedWidthPct(
          element,
          fontSize,
          width,
          maxHeight,
          measurer,
        );
    minWidth = minWidthForFontPct(element, fontSize, maxWidth, measurer);
    width = Math.min(maxWidth, Math.max(width, minWidth));
    height = fitTextHeightPct(element, fontSize, width, measurer);
  }
  height = Math.min(maxHeight, height);

  let x = startBox.x;
  if (west) x = startBox.x + startBox.w - width;
  let y = startBox.y;
  if (north) y = startBox.y + startBox.h - height;

  return { box: clampBox({ x, y, w: width, h: height }), fontSize };
}

export function fitBoxToAspect(
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

export function fitElementBoxToContent(
  element: SlideElement,
  visuals: ReadonlyMap<string, Visual>,
  stageAspect: number,
  elements: readonly SlideElement[] = [element],
): ElementBox {
  switch (element.kind) {
    case "placeholder":
      return element.box;
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
      if (element.shape !== "line") return element.box;
      const resolveConnectorBox = (candidate: SlideElement) =>
        candidate.kind === "shape" && candidate.shape === "line"
          ? candidate.box
          : fitElementBoxToContent(candidate, visuals, stageAspect, elements);
      const endpoints = resolveLineEndpoints(
        element,
        elements,
        resolveConnectorBox,
        stageAspect,
      );
      const lineBox = clampBox(
        lineBoxFromEndpoints(
          endpoints.start,
          endpoints.end,
          element.box.h,
          stageAspect,
        ).box,
      );
      return positionFitWithinBox(lineBox, {
        w: lineBox.w,
        h: SELECTION_MIN_H_PCT,
      });
    case "image":
      return element.box;
    case "connector":
      return element.box;
    default:
      return assertNever(element);
  }
}

export function applyResize(
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
