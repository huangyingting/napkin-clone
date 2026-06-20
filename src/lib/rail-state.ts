/** Minimum viewport width (px) at which the editing rail docks inline. */
export const RAIL_BREAKPOINT_PX = 1024;

/**
 * Pure predicate: returns true if the given viewport width is wide enough to
 * show the docked editing rail inline beside the article column.
 *
 * DOM-free so it can be called from unit tests and from the hook below.
 */
export function isRailWidth(viewportWidth: number): boolean {
  return viewportWidth >= RAIL_BREAKPOINT_PX;
}

