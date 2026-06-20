"use client";

import { useEffect, useState } from "react";

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

/**
 * Returns true when the viewport is wide enough for the docked editing rail
 * (≥ {@link RAIL_BREAKPOINT_PX} px). Reacts to window resize events.
 *
 * SSR default is `false` to avoid hydration mismatch — the rail appears on the
 * first client render if the viewport is wide enough.
 */
export function useIsRailActive(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(isRailWidth(window.innerWidth));
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return active;
}
