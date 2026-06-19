/**
 * Shared class strings for the editor's interactive controls (spark button,
 * floating toolbar, "+"/"/" insert menu, and the contextual visual-card
 * controls). Centralizing them keeps hover / active / focus-visible feedback
 * consistent across every control and uses the app's zinc theme palette with
 * `dark:` variants (US-016).
 *
 * These are plain class-name constants (no React), so they can be composed into
 * any client component's `className`.
 */

/**
 * Keyboard focus ring. Pair with `focus-visible` (not `focus`) so the ring only
 * shows for keyboard users, matching the rest of the app's affordances.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-white dark:focus-visible:ring-offset-zinc-900";

/**
 * Square icon button that floats in the editor gutter (the per-block spark and
 * the "+" insert button). Includes hover, active (pressed), and focus-visible
 * feedback in both light and dark mode.
 */
export const GUTTER_BUTTON = `flex h-7 w-7 items-center justify-center rounded-lg border border-black/[.08] bg-white text-zinc-500 shadow-sm transition-colors hover:bg-black/[.06] hover:text-zinc-900 active:bg-black/[.12] aria-expanded:bg-black/[.06] aria-expanded:text-zinc-900 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.1] dark:hover:text-zinc-100 dark:active:bg-white/[.16] ${FOCUS_RING}`;

/**
 * A compact toolbar/menu control that toggles between an inactive and active
 * (pressed) appearance. Used by the floating toolbar and the insert menu so the
 * selected state, hover, active, and focus-visible feedback all match.
 */
export function controlToggleClass(active: boolean): string {
  return [
    "transition-colors active:translate-y-0",
    active
      ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      : "text-zinc-700 hover:bg-black/[.05] active:bg-black/[.1] dark:text-zinc-200 dark:hover:bg-white/[.08] dark:active:bg-white/[.14]",
    FOCUS_RING,
  ].join(" ");
}
