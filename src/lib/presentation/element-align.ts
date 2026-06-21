/**
 * Pure, DOM-free alignment math for the free-form slide stage (issue #237).
 *
 * Given a set of element {@link ElementBox}es and an alignment mode,
 * {@link alignBoxes} returns a new array of boxes repositioned so they share a
 * common edge or center, computed from the selection's bounding box. The math
 * is percentage-based (0–100) like every {@link ElementBox}, so it is
 * resolution independent and trivially unit-testable.
 *
 * Only the relevant axis is touched: the x-axis modes (`left`/`hcenter`/
 * `right`) leave each box's `y`/`h` untouched, and the y-axis modes
 * (`top`/`vmiddle`/`bottom`) leave each box's `x`/`w` untouched. Sizes are
 * never changed. The input array and its boxes are never mutated.
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
