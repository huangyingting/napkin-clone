"use client";

/**
 * Client-local store for saved deck **theme presets** (the "Save preset"
 * library in the deck theme panel).
 *
 * A preset is a named snapshot of a {@link PresentationTheme} the user can
 * reapply to any deck. This is intentionally a *client-local* store backed by
 * `localStorage` (per-browser, no server round-trip) — a pragmatic home for a
 * personal preset library. Swapping the four functions below for a server-
 * backed API (Brand-style persistence) would not change the panel.
 *
 * All reads/writes are SSR-safe (guarded on `window`) and resilient to
 * malformed/oversized storage (try/catch, returns `[]` on failure).
 */

import type { PresentationTheme } from "./presentation-theme-types";

const STORAGE_KEY = "textiq:deck-theme-presets:v1";

export interface CustomThemePreset {
  /** Stable id (also used as the token set's id when applied). */
  id: string;
  /** User-facing name shown on the preset card. */
  name: string;
  /** The captured token set. */
  tokenSet: PresentationTheme;
  /** Epoch millis the preset was saved (for newest-first ordering). */
  createdAt: number;
}

function read(): CustomThemePreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomThemePreset[]) : [];
  } catch {
    return [];
  }
}

function write(list: CustomThemePreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota / serialization failures — presets are best-effort.
  }
}

/** All saved presets, newest first. */
export function listThemePresets(): CustomThemePreset[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

/** Saves `tokenSet` under `name`, returning the created preset. */
export function saveThemePreset(
  name: string,
  tokenSet: PresentationTheme,
): CustomThemePreset {
  const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const preset: CustomThemePreset = {
    id,
    name: name.trim() || "Untitled preset",
    // Re-id the token set so applied presets read as a distinct custom set.
    tokenSet: { ...tokenSet, id, name: name.trim() || tokenSet.name },
    createdAt: Date.now(),
  };
  write([preset, ...read().filter((p) => p.id !== id)]);
  return preset;
}

/** Removes the preset with `id`. */
export function deleteThemePreset(id: string): void {
  write(read().filter((p) => p.id !== id));
}
