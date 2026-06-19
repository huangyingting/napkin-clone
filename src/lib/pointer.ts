"use client";

import { useEffect, useState } from "react";

/**
 * Queries whether the primary pointer is "fine" (mouse / trackpad) using the
 * supplied `matchMedia` implementation. Pass a custom implementation in tests.
 *
 * Defaults to `window.matchMedia` in the browser; returns `true` on the server
 * (SSR) so that the initial render always shows all controls (progressive
 * enhancement — they are hidden in a subsequent client render if touch is
 * detected).
 */
export function queryIsPointerFine(
  matchMedia: (query: string) => { matches: boolean } = typeof window !==
  "undefined"
    ? (q) => window.matchMedia(q)
    : () => ({ matches: true }),
): boolean {
  return matchMedia("(pointer: fine)").matches;
}

/**
 * Returns `true` when the primary pointing device is fine (mouse/trackpad) and
 * `false` when it is coarse (touch/stylus). Reacts to changes so plugging in a
 * mouse after the page loads gives an accurate result.
 *
 * SSR default is `true` (controls are shown; touch detection happens on mount).
 */
export function useIsPointerFine(): boolean {
  const [fine, setFine] = useState(() => queryIsPointerFine());

  useEffect(() => {
    const mql = window.matchMedia("(pointer: fine)");
    const handler = (event: MediaQueryListEvent) => setFine(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return fine;
}
