/**
 * Shared micro-interaction utility classes for the content-first editor controls
 * — the per-paragraph spark button, the floating format toolbar buttons, and the
 * mini-toolbar pill controls (Share, Comments). Centralizing them keeps hover,
 * active (press), and focus-visible feedback consistent across every editor
 * button, and ensures transitions are disabled under `prefers-reduced-motion`
 * (US-013).
 *
 * All states use the existing zinc palette with `dark:` variants and short
 * transitions.
 */

/** Short transition that is removed under `prefers-reduced-motion`. */
export const CONTROL_TRANSITION =
  "transition duration-150 motion-reduce:transition-none";

/** Clear, accessible keyboard focus ring (light + dark). */
export const CONTROL_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500";

/**
 * Subtle tactile press feedback shared by all editor controls. The scale rides
 * the control's transition, so it is animated normally and snaps (no animation)
 * under reduced motion.
 */
export const CONTROL_PRESS = "active:scale-[0.98]";

/**
 * Pill-style control used by the mini-toolbar (Share, Comments) buttons: a
 * rounded-full bordered button with consistent hover, press, and focus-visible
 * states.
 */
export const PILL_CONTROL_CLASS = [
  "rounded-full border border-black/[.06] px-4 py-2 text-sm font-medium text-zinc-700",
  CONTROL_TRANSITION,
  CONTROL_PRESS,
  "hover:bg-zinc-100 active:bg-zinc-200",
  CONTROL_FOCUS_RING,
  "dark:border-white/[.08] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700",
].join(" ");
