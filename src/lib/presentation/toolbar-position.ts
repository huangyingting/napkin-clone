/**
 * Pure, DOM-free clamping math for floating selection toolbars (issue #248).
 *
 * The Align and Element toolbars float horizontally centered over a selection
 * and must stay on-canvas. The naive clamp `Math.max(margin, Math.min(width -
 * margin, leftPx))` breaks on narrow stages (phone / bottom-sheet preview):
 * once the fitted stage width drops below `2 * margin`, `width - margin` falls
 * below `margin`, the inner `Math.min` wins, and the outer `Math.max` then pins
 * the toolbar to `margin` — off the right edge, partly off-canvas, regardless of
 * where the selection actually is.
 *
 * {@link clampToolbarLeft} fixes this by shrinking the margin to at most half
 * the stage width, so the clamp window never inverts. On a very narrow stage the
 * window collapses to the stage center, keeping the toolbar fully within
 * `[0, width]` instead of hanging off an edge.
 */

/**
 * Clamp a toolbar's center-x (`leftPx`) so it stays within a stage of the given
 * `width`, keeping at least `margin` px from each edge when there is room.
 *
 * The effective margin is capped at `width / 2`, which guarantees the lower
 * bound never exceeds the upper bound; when the stage is too narrow to honour
 * the requested margin the toolbar is centered. The result is always within
 * `[0, width]` for any non-negative `width`.
 */
export function clampToolbarLeft(
  leftPx: number,
  width: number,
  margin: number,
): number {
  const safeWidth = Math.max(0, width);
  const effectiveMargin = Math.min(margin, safeWidth / 2);
  const min = effectiveMargin;
  const max = safeWidth - effectiveMargin;
  return Math.min(Math.max(leftPx, min), max);
}
