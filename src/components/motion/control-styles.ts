/**
 * Shared class strings for the editor's interactive controls (spark button,
 * floating toolbar, "+"/"/" insert menu, and the contextual visual-card
 * controls). Centralizing them keeps hover / active / focus-visible feedback
 * consistent across every control.
 *
 * These compose the `--ds-*` design-system chrome tokens (globals.css) via their
 * Tailwind utilities (`ds-*`). Because those tokens flip in the
 * prefers-color-scheme dark block, the classes below need no mode variants —
 * one class is correct in both light and dark. Raw palette literals stay out of
 * this shared control vocabulary.
 *
 * These are plain class-name constants (no React), so they can be composed into
 * any client component's `className`.
 */

/**
 * Keyboard focus ring. Pair with `focus-visible` (not `focus`) so the ring only
 * shows for keyboard users, matching the rest of the app's affordances.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-ds-focus-offset";

/**
 * Square icon button that floats in the editor gutter (the per-block spark and
 * the "+" insert button). Includes hover, active (pressed), and focus-visible
 * feedback, all driven by `--ds-*` tokens.
 */
export const GUTTER_BUTTON = `flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised text-ds-text-muted shadow-ds-raised transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary active:bg-ds-state-active aria-expanded:bg-ds-state-hover aria-expanded:text-ds-text-primary ${FOCUS_RING}`;
