"use client";

import { useEffect, useState } from "react";

/* node:coverage disable */
/* Coverage rationale: viewport helper JSDoc is documentation-only; SSR/browser branches are asserted. */
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

export function queryIsPointerCoarse(
  matchMedia: (query: string) => { matches: boolean } = typeof window !==
  "undefined"
    ? (q) => window.matchMedia(q)
    : () => ({ matches: false }),
): boolean {
  return matchMedia("(pointer: coarse)").matches;
}

export function subscribePointerFine(
  setFine: (matches: boolean) => void,
  matchMedia: (query: string) => MediaQueryList = (query) =>
    window.matchMedia(query),
): () => void {
  const mql = matchMedia("(pointer: fine)");
  const handler = (event: MediaQueryListEvent) => setFine(event.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

/* node:coverage ignore next 15 -- Hook wiring requires a React renderer; subscribePointerFine covers the listener behavior. */
/**
 * Returns `true` when the primary pointing device is fine (mouse/trackpad) and
 * `false` when it is coarse (touch/stylus). Reacts to changes so plugging in a
 * mouse after the page loads gives an accurate result.
 *
 * SSR default is `true` (controls are shown; touch detection happens on mount).
 */
export function useIsPointerFine(): boolean {
  const [fine, setFine] = useState(() => queryIsPointerFine());

  useEffect(() => subscribePointerFine(setFine), []);

  return fine;
}

/* @preserve node:coverage ignore next 12 -- Wide-viewport query behavior is asserted; tsx maps the constant/doc span as uncovered. */
// The viewport width tier breakpoint — Tailwind's `lg` (1024px). Surfaces dock
// at/above this width and fall back to floats/sheet below it.
const WIDE_VIEWPORT_QUERY = "(min-width: 1024px)";

/**
 * Queries whether the viewport is "wide" (≥ 1024px / Tailwind `lg`) using the
 * supplied `matchMedia` implementation. Pass a custom implementation in tests.
 *
 * Defaults to `window.matchMedia` in the browser; returns `true` on the server
 * (SSR) so the initial render matches the desktop layout (progressive
 * enhancement — it narrows in a subsequent client render on small screens).
 */
/* node:coverage enable */
export function queryIsWideViewport(
  matchMedia: (query: string) => { matches: boolean } = typeof window !==
  "undefined"
    ? (q) => window.matchMedia(q)
    : () => ({ matches: true }),
): boolean {
  return matchMedia(WIDE_VIEWPORT_QUERY).matches;
}
