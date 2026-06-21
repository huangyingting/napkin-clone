/**
 * Pure helper for pointer-based slide-thumbnail reordering.
 *
 * The slide editor reorders thumbnails with the Pointer API (so it works with
 * touch, unlike HTML5 drag-and-drop). This module isolates the one piece of
 * geometry that benefits from a DOM-free unit test: mapping a pointer position
 * along the rail axis to the thumbnail index it currently hovers.
 */

/** The extent of a thumbnail along the rail's main axis. */
export interface RailItemExtent {
  /** Leading edge (top for a vertical rail, left for a horizontal strip). */
  start: number;
  /** Trailing edge (bottom for a vertical rail, right for a horizontal strip). */
  end: number;
}

/**
 * Given a pointer coordinate along the rail's main axis and the ordered extents
 * of each thumbnail, returns the index the dragged slide should drop onto.
 *
 * An item is "hovered" once the pointer passes the midpoint of every earlier
 * item, so the drop target flips as the pointer crosses each thumbnail's centre.
 * The result is always clamped to `[0, items.length - 1]`; an empty list yields
 * `0` (defensive).
 *
 * Axis-agnostic: the caller passes `clientY`/top-bottom for a vertical rail and
 * `clientX`/left-right for a horizontal strip.
 */
export function reorderTargetIndex(
  pointer: number,
  items: readonly RailItemExtent[],
): number {
  if (items.length === 0) return 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const midpoint = (item.start + item.end) / 2;
    if (pointer < midpoint) return i;
  }
  return items.length - 1;
}
