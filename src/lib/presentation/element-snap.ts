/**
 * Pure, DOM-free snapping math for the free-form slide stage (issue #225).
 *
 * Given a box being dragged, the boxes of the *other* elements on the slide, and
 * a threshold, {@link snapBox} nudges the moving box so its edges or center line
 * up with a nearby element edge/center or the slide's own edges/center — and
 * reports the active guide lines so the stage can draw them. The math is
 * percentage-based (0–100) like every {@link ElementBox}, so it is resolution
 * independent and trivially unit-testable.
 *
 * Snapping is intentionally subtle: only the single closest match per axis (and
 * only within `threshold`) is applied, so a drag that ends with no near match
 * leaves the box exactly where the user dropped it.
 */

import type { ElementBox } from "./deck";

/**
 * An active alignment guide to render while dragging.
 *
 * `axis: "x"` is a **vertical** line at a constant x position (an x-coordinate
 * the moving box snapped to); `axis: "y"` is a **horizontal** line at a constant
 * y position. `position` is in percent of the slide on that axis.
 */
export interface SnapGuide {
  axis: "x" | "y";
  position: number;
}

/** Output of {@link snapBox}: the (possibly) adjusted box and active guides. */
export interface SnapResult {
  box: ElementBox;
  guides: SnapGuide[];
}

/** Slide-relative target lines that every box can snap to: edges + center. */
const SLIDE_LINES = [0, 50, 100] as const;

interface AxisSnap {
  /** New leading-edge coordinate that aligns the chosen candidate to a line. */
  start: number;
  /** The target line the box snapped to (the guide position). */
  line: number;
}

/**
 * Snaps one axis. `start` is the moving box's leading edge (x or y), `size` its
 * extent (w or h). The moving box exposes three candidate alignment points —
 * leading edge, center, trailing edge — and each target line is tested against
 * all three; the single closest match within `threshold` wins. Returns `null`
 * when nothing is close enough.
 */
function snapAxis(
  start: number,
  size: number,
  targetLines: readonly number[],
  threshold: number,
): AxisSnap | null {
  const candidateOffsets = [0, size / 2, size];
  let best: (AxisSnap & { dist: number }) | null = null;

  for (const offset of candidateOffsets) {
    const pos = start + offset;
    for (const line of targetLines) {
      const dist = Math.abs(pos - line);
      if (dist <= threshold && (best === null || dist < best.dist)) {
        best = { start: line - offset, line, dist };
      }
    }
  }

  return best ? { start: best.start, line: best.line } : null;
}

/** Collects the leading edge, center, and trailing edge of a box on one axis. */
function axisLines(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

/**
 * Snaps `box` against the `others` boxes' edges/centers and the slide's own
 * edges/center, within `threshold` percent. Returns the adjusted box and the
 * active guide lines (at most one per axis). When no edge is within `threshold`
 * the box is returned unchanged with no guides, so releasing a drag with no near
 * match leaves the box exactly where it was dragged.
 */
export function snapBox(
  box: ElementBox,
  others: readonly ElementBox[],
  threshold: number,
): SnapResult {
  const xTargets: number[] = [...SLIDE_LINES];
  const yTargets: number[] = [...SLIDE_LINES];
  for (const other of others) {
    xTargets.push(...axisLines(other.x, other.w));
    yTargets.push(...axisLines(other.y, other.h));
  }

  const sx = snapAxis(box.x, box.w, xTargets, threshold);
  const sy = snapAxis(box.y, box.h, yTargets, threshold);

  const guides: SnapGuide[] = [];
  if (sx) {
    guides.push({ axis: "x", position: sx.line });
  }
  if (sy) {
    guides.push({ axis: "y", position: sy.line });
  }

  return {
    box: {
      ...box,
      x: sx ? sx.start : box.x,
      y: sy ? sy.start : box.y,
    },
    guides,
  };
}
