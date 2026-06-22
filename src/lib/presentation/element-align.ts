/**
 * Pure, DOM-free alignment math for the free-form slide stage (issue #237,
 * issue #328).
 *
 * Given a set of element {@link ElementBox}es and an alignment mode,
 * {@link alignBoxes} returns a new array of boxes repositioned so they share a
 * common edge or center, computed from the selection's bounding box. The math
 * is percentage-based (0–100) like every {@link ElementBox}, so it is
 * resolution independent and trivially unit-testable.
 *
 * Also provides {@link distributeBoxes} (even-gap spacing), and
 * {@link matchSizeBoxes} (resize to a reference element). All helpers are
 * pure: they never mutate their inputs.
 *
 * Only the relevant axis is touched: the x-axis modes (`left`/`hcenter`/
 * `right`) leave each box's `y`/`h` untouched, and the y-axis modes
 * (`top`/`vmiddle`/`bottom`) leave each box's `x`/`w` untouched. Sizes are
 * never changed by align. The input array and its boxes are never mutated.
 */

import type { ElementBox } from "./deck";

/** The six alignment modes: three on the x-axis, three on the y-axis. */
export type AlignMode =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vmiddle"
  | "bottom";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Computes the tight bounding box (in percent) enclosing every box. */
function boundsOf(boxes: readonly ElementBox[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Aligns `boxes` to the shared edge/center of their selection bounding box.
 *
 * Returns a brand-new array of new box objects; the input is never mutated. A
 * single-box selection is a no-op (its bounding box is itself, so every mode
 * leaves it where it is). An empty selection returns an empty array.
 */
export function alignBoxes(
  boxes: readonly ElementBox[],
  mode: AlignMode,
): ElementBox[] {
  if (boxes.length === 0) {
    return [];
  }
  const { minX, minY, maxX, maxY } = boundsOf(boxes);
  const hCenter = (minX + maxX) / 2;
  const vMiddle = (minY + maxY) / 2;

  return boxes.map((box) => {
    switch (mode) {
      case "left":
        return { ...box, x: minX };
      case "hcenter":
        return { ...box, x: hCenter - box.w / 2 };
      case "right":
        return { ...box, x: maxX - box.w };
      case "top":
        return { ...box, y: minY };
      case "vmiddle":
        return { ...box, y: vMiddle - box.h / 2 };
      case "bottom":
        return { ...box, y: maxY - box.h };
    }
  });
}

/** The two distribution axes (issue #328). */
export type DistributeMode = "horizontal" | "vertical";

/**
 * Spaces `boxes` evenly along the given axis.
 *
 * The outermost boxes (by their leading edge on the axis) are kept in place;
 * the inner boxes are repositioned so gaps between adjacent boxes are equal.
 * With fewer than 3 boxes there is nothing to redistribute, so each box is
 * returned unchanged (same position, new object). Only the position on the
 * relevant axis is changed — sizes and the perpendicular axis are untouched.
 * The input array and boxes are never mutated.
 */
export function distributeBoxes(
  boxes: readonly ElementBox[],
  mode: DistributeMode,
): ElementBox[] {
  if (boxes.length < 2) {
    return boxes.map((b) => ({ ...b }));
  }
  if (boxes.length === 2) {
    return boxes.map((b) => ({ ...b }));
  }

  const indexed = boxes.map((b, i) => ({ b, i }));

  if (mode === "horizontal") {
    const sorted = [...indexed].sort((a, z) => a.b.x - z.b.x);
    const first = sorted[0].b;
    const last = sorted[sorted.length - 1].b;
    const span = last.x + last.w - first.x;
    const totalWidth = sorted.reduce((sum, { b }) => sum + b.w, 0);
    const gap = (span - totalWidth) / (sorted.length - 1);
    const newX = new Array<number>(boxes.length);
    let cursor = first.x;
    for (const { b, i } of sorted) {
      newX[i] = cursor;
      cursor += b.w + gap;
    }
    return boxes.map((b, i) => ({ ...b, x: newX[i] }));
  }

  // vertical
  const sorted = [...indexed].sort((a, z) => a.b.y - z.b.y);
  const first = sorted[0].b;
  const last = sorted[sorted.length - 1].b;
  const span = last.y + last.h - first.y;
  const totalHeight = sorted.reduce((sum, { b }) => sum + b.h, 0);
  const gap = (span - totalHeight) / (sorted.length - 1);
  const newY = new Array<number>(boxes.length);
  let cursor = first.y;
  for (const { b, i } of sorted) {
    newY[i] = cursor;
    cursor += b.h + gap;
  }
  return boxes.map((b, i) => ({ ...b, y: newY[i] }));
}

/** The three match-size modes (issue #328). */
export type MatchSizeMode = "width" | "height" | "both";

/**
 * Resizes all `boxes` to match the dimensions of `boxes[0]` (the primary
 * selection). Each resized box is repositioned so its center stays fixed.
 * The first box is returned unchanged. With fewer than 2 boxes the input is
 * returned element-for-element as new objects (no-op). The input is never
 * mutated.
 */
export function matchSizeBoxes(
  boxes: readonly ElementBox[],
  mode: MatchSizeMode,
): ElementBox[] {
  if (boxes.length < 2) {
    return boxes.map((b) => ({ ...b }));
  }
  const ref = boxes[0];
  return boxes.map((b, i) => {
    if (i === 0) return { ...b };
    const newW = mode === "height" ? b.w : ref.w;
    const newH = mode === "width" ? b.h : ref.h;
    // Keep the center point fixed when the size changes.
    return {
      x: b.x + b.w / 2 - newW / 2,
      y: b.y + b.h / 2 - newH / 2,
      w: newW,
      h: newH,
    };
  });
}

/**
 * Computes the tight bounding box (percent) enclosing every box.
 * Re-exported for callers that need it outside this module.
 */
export function boundingBoxOf(boxes: readonly ElementBox[]): ElementBox | null {
  if (boxes.length === 0) return null;
  const { minX, minY, maxX, maxY } = boundsOf(boxes);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
