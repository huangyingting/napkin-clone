/**
 * Shared motion tokens for the TextIQ design system.
 *
 * All animation durations are in seconds (framer-motion convention). Easing
 * names are framer-motion easing string literals. Use these instead of
 * inline literals so every motion surface shares the same scale and a single
 * edit adjusts the feel app-wide.
 *
 * Owned by Mouse; consumed by `src/components/motion/` and
 * `src/components/ui/` primitives.
 */

/** Animation durations (seconds, framer-motion convention). */
export const DURATION = {
  /** Zero — used as a reduced-motion fallback so elements appear instantly. */
  instant: 0,
  /** 120 ms — tooltip appear/disappear. */
  tooltip: 0.12,
  /** 140 ms — floating overlay pop (toolbar, menus, popovers). */
  pop: 0.14,
  /** 150 ms — status indicator fade. */
  status: 0.15,
  /** 160 ms — modal dialog scale-in. */
  modal: 0.16,
  /** 180 ms — overlay backdrop fade. */
  backdrop: 0.18,
  /** 200 ms — card/visual mount. */
  card: 0.2,
  /** 220 ms — drawer slide-in. */
  drawer: 0.22,
  /** 240 ms — bottom sheet slide-up. */
  sheet: 0.24,
  /** 900 ms — repeating pulse loop (ThinkingIndicator dots). */
  pulse: 0.9,
} as const;

export type Duration = keyof typeof DURATION;

/** Easing presets (framer-motion easing string literals). */
export const EASE = {
  out: "easeOut",
  inOut: "easeInOut",
} as const;

export type Ease = keyof typeof EASE;
