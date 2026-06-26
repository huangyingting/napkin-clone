"use client";

import { type Transition } from "framer-motion";

import { DURATION, EASE } from "./tokens";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Motion props spreadable onto a `motion.*` element (`initial`/`animate`/`exit`
 * + `transition`). All presets are transform/opacity-based so they never trigger
 * layout shift, and they collapse to a no-op when the user prefers reduced
 * motion (US-015).
 */
export type RevealMotion = {
  initial: Record<string, number>;
  animate: Record<string, number>;
  exit: Record<string, number>;
  transition: Transition;
};

// No movement, no fade — element simply appears/disappears instantly. Used when
// the OS/browser requests reduced motion.
const NO_MOTION: RevealMotion = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1 },
  transition: { duration: DURATION.instant },
};

/**
 * Fade + subtle scale for transient overlays (floating toolbar, "+"/"/" insert
 * menu, block spark button/panel, the visual card controls popover). Pair with
 * `<AnimatePresence>` so the exit animation can run before unmount.
 */
export function usePopMotion(): RevealMotion {
  const reduce = useReducedMotion();
  if (reduce) {
    return NO_MOTION;
  }
  return {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { duration: DURATION.pop, ease: EASE.out },
  };
}

/**
 * Slightly softer fade + scale for blocks/cards (e.g. a visual card mounting
 * into the document). Mount-only usages can spread `initial`/`animate`/
 * `transition`; in/out usages should wrap in `<AnimatePresence>`.
 */
export function useCardMotion(): RevealMotion {
  const reduce = useReducedMotion();
  if (reduce) {
    return NO_MOTION;
  }
  return {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.97 },
    transition: { duration: DURATION.card, ease: EASE.out },
  };
}
