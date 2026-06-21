/**
 * Pure, DOM-free helpers backing the docked-rail user preference (epic #87,
 * item 4). Kept React- and `window`-free so the parse / normalise / toggle
 * logic is unit-testable headlessly under `node --test`; the React controller
 * ({@link docked-preference.tsx}) layers `localStorage` + state on top.
 */

import type { DockedPreference } from "./editing-surface";

/**
 * The exact `localStorage` key the docked preference persists under. Stable and
 * namespaced so it never collides with other TextIQ settings.
 */
export const DOCKED_PREFERENCE_STORAGE_KEY = "textiq:editing.dockedPreference";

/**
 * Normalises a raw `localStorage` value into a {@link DockedPreference}.
 * Only the exact string `"on"` enables the docked rail; `null` (unset),
 * `"off"`, and any unrecognised / corrupt value all fall back to `"off"`.
 * This keeps the default OFF so behaviour matches today's float/sheet surfaces.
 */
export function parseStoredDockedPreference(
  raw: string | null,
): DockedPreference {
  return raw === "on" ? "on" : "off";
}

/**
 * Flips a {@link DockedPreference} between its two states. Pure — exposed
 * separately so the on↔off transition can be asserted without a DOM.
 */
export function toggleDockedPreference(
  current: DockedPreference,
): DockedPreference {
  return current === "on" ? "off" : "on";
}
