"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DockedPreference } from "@/lib/lexical/editing-surface";

/**
 * The docked-rail preference seam (epic #87).
 *
 * Whether the user prefers the persistent right-side docked rail over the
 * in-place float/sheet surfaces. It defaults to `"off"`, which makes the
 * unified {@link useEditingSurface} resolve to exactly today's float/sheet
 * behaviour (verified byte-for-byte by the 24-row matrix).
 *
 * ── SIBLING-PR SEAM ────────────────────────────────────────────────────────
 * A follow-up PR adds the `PanelRight` toggle + localStorage persistence. It
 * only has to:
 *   1. Replace the value passed to {@link DockedPreferenceProvider} with a
 *      state hook backed by localStorage (read on mount, persist on change),
 *      and
 *   2. Render the toggle button that flips that state.
 * It does NOT need to re-wire any surface: every surface already derives its
 * mode/group from {@link resolveEditingSurface} via {@link useEditingSurface},
 * which reads this preference. Keeping the default context value `"off"` means
 * the seam is inert (and behaviour is unchanged) until that PR lands.
 */
const DockedPreferenceContext = createContext<DockedPreference>("off");

/**
 * Provides the docked-rail preference to the surface tree. Currently always
 * supplies `"off"` unless an explicit `value` is passed; the sibling PR backs
 * `value` with localStorage-persisted state.
 */
export function DockedPreferenceProvider({
  value = "off",
  children,
}: {
  value?: DockedPreference;
  children: ReactNode;
}) {
  return (
    <DockedPreferenceContext.Provider value={value}>
      {children}
    </DockedPreferenceContext.Provider>
  );
}

/**
 * Reads the current docked-rail preference. Returns `"off"` when no provider is
 * mounted (the default until the sibling PR), so callers are safe to use it
 * unconditionally.
 */
export function useDockedPreference(): DockedPreference {
  return useContext(DockedPreferenceContext);
}
