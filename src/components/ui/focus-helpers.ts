/**
 * Pure focus-management helpers consumed by the Dialog and Popover primitives.
 *
 * All logic is free of browser globals so the same module can be imported in
 * Node test files (node --import tsx --test) without jsdom.
 */

/**
 * CSS selector that matches every element that participates in the tab order by
 * default or via an explicit non-negative tabindex.
 */
export const TABBABLE_SELECTOR =
  'a[href]:not([disabled]), button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Returns all tabbable descendants of `container` in DOM order.
 *
 * Accepts any object that exposes `querySelectorAll` so tests can pass a
 * lightweight mock instead of a real DOM node.
 */
export function getTabbableElements(container: {
  querySelectorAll: (selector: string) => ArrayLike<Element>;
}): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(TABBABLE_SELECTOR),
  ) as HTMLElement[];
}

/**
 * Computes the next focus index inside a focus trap given the current index and
 * Tab direction.  Wraps around at both ends.
 *
 * @param count      Total number of tabbable elements in the trap.
 * @param currentIdx Index of the currently focused element (-1 if none).
 * @param shiftKey   `true` when Shift+Tab (backwards).
 * @returns          Next index to focus, or -1 when `count` is 0.
 */
export function nextFocusIndex(
  count: number,
  currentIdx: number,
  shiftKey: boolean,
): number {
  if (count === 0) return -1;
  if (shiftKey) {
    return currentIdx <= 0 ? count - 1 : currentIdx - 1;
  }
  return currentIdx >= count - 1 ? 0 : currentIdx + 1;
}

/* node:coverage disable -- TypeScript erases this exported action type. */
// prettier-ignore
export type DialogAction = { type: "open" } | { type: "close" } | { type: "toggle" };
export function dialogReducer(open: boolean, action: DialogAction): boolean {
  /* node:coverage enable */
  switch (action.type) {
    case "open":
      return true;
    case "close":
      return false;
    case "toggle":
      return !open;
  }
}
