/**
 * Pure, DOM-free marquee (rubber-band) selection math for the free-form slide
 * stage (issue #245).
 *
 * A marquee is the rectangle the user drags across empty stage background to
 * build a multi-selection on touch *and* mouse (via the Pointer API). The
 * geometry is percentage-based (0–100) like every {@link ElementBox}, so it is
 * resolution independent and trivially unit-testable.
 *
 * Two concerns live here:
 *  - {@link normalizeRect} folds a rectangle dragged up/left (negative `w`/`h`)
 *    into an equivalent positive-size rectangle.
 *  - {@link boxesIntersectingRect} reports which element boxes the marquee
 *    touches. Overlap is inclusive: an element whose edge merely grazes the
 *    marquee counts as selected, matching the intuition that "if the band
 *    reaches it, it's in".
 *
 * No DOM, no React — fully testable under `node --test`.
 */

import type { ElementBox } from "./deck";

/** A rectangle in percent coordinates; `w`/`h` may be negative before normalize. */
export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box tagged with the id of the element it belongs to. */
export interface IdentifiedBox {
  id: string;
  box: ElementBox;
}

/**
 * Folds a rectangle that may have been dragged up and/or left — and so carries
 * a negative `w`/`h` — into an equivalent rectangle with a positive size and a
 * top-left origin. A rectangle that is already positive-size is returned
 * unchanged in value.
 */
export function normalizeRect(rect: MarqueeRect): MarqueeRect {
  const x = rect.w < 0 ? rect.x + rect.w : rect.x;
  const y = rect.h < 0 ? rect.y + rect.h : rect.y;
  return { x, y, w: Math.abs(rect.w), h: Math.abs(rect.h) };
}

/**
 * True when the (already-normalized) rectangle `a` overlaps the box `b`. Overlap
 * is inclusive on every edge, so an element the marquee merely touches counts as
 * intersecting.
 */
function normalizedRectIntersectsBox(a: MarqueeRect, b: ElementBox): boolean {
  return (
    a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
  );
}

/**
 * Returns the ids of every box that intersects the marquee `rect`. The rect is
 * normalized first, so a band dragged in any direction works identically. Input
 * order is preserved; the input is never mutated.
 */
export function boxesIntersectingRect(
  boxes: readonly IdentifiedBox[],
  rect: MarqueeRect,
): string[] {
  const norm = normalizeRect(rect);
  return boxes
    .filter(({ box }) => normalizedRectIntersectsBox(norm, box))
    .map(({ id }) => id);
}
