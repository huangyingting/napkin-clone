/**
 * Executable registry of the application's keyboard shortcuts.
 *
 * This module is intentionally framework-free (no React/DOM imports) so it can
 * be unit-tested and reused by matchers, discoverable help, canvas help, and
 * local editor tool labels.
 *
 * Entries are defined in per-domain modules and composed here:
 *  - catalog-global.ts       – Global + Dashboard shortcuts
 *  - catalog-editor.ts       – Editor shortcuts
 *  - catalog-canvas.ts       – Slide canvas shortcuts
 *  - catalog-presentation.ts – Presentation-mode shortcuts
 */

export type {
  ShortcutScope,
  ShortcutSurface,
  ShortcutHandlerKind,
  ShortcutId,
  KeyMatcherMetadata,
  KeyEventLike,
  ShortcutEntry,
} from "./catalog-types";

export { EDITOR_TEXT_TOOL_SHORTCUT_IDS } from "./catalog-editor";

import type {
  ShortcutScope,
  ShortcutId,
  KeyMatcherMetadata,
  KeyEventLike,
  ShortcutEntry,
} from "./catalog-types";
import { GLOBAL_SHORTCUTS } from "./catalog-global";
import { EDITOR_SHORTCUTS } from "./catalog-editor";
import { CANVAS_SHORTCUTS } from "./catalog-canvas";
import { PRESENTATION_SHORTCUTS } from "./catalog-presentation";
import {
  lower,
  modifierMatches,
  formatDisplayToken,
  formatShortcutLabel,
} from "./catalog-keys";

/** Ordered scopes for grouping entries in the help dialog. */
export const SHORTCUT_SCOPES: ShortcutScope[] = [
  "Global",
  "Dashboard",
  "Editor",
  "Slides",
];

const SHORTCUTS: readonly ShortcutEntry[] = [
  ...GLOBAL_SHORTCUTS,
  ...EDITOR_SHORTCUTS,
  ...CANVAS_SHORTCUTS,
  ...PRESENTATION_SHORTCUTS,
];

export const SHORTCUT_REGISTRY: readonly ShortcutEntry[] = SHORTCUTS;

const SHORTCUT_BY_ID = new Map(SHORTCUTS.map((entry) => [entry.id, entry]));

/** Returns the shortcuts that belong to a given scope, in registry order. */
export function shortcutsForScope(scope: ShortcutScope): ShortcutEntry[] {
  return SHORTCUTS.filter(
    (entry) => entry.scope === scope && entry.showInGlobalHelp !== false,
  );
}

export function shortcutById(id: ShortcutId): ShortcutEntry {
  const entry = SHORTCUT_BY_ID.get(id);
  if (!entry) {
    throw new Error(`Unknown shortcut id: ${id}`);
  }
  return entry;
}

export function shortcutCanonical(id: ShortcutId): string | undefined {
  return shortcutById(id).canonical;
}

export function shortcutDisplayTokens(
  entry: ShortcutEntry,
  opts: { isMac?: boolean } = {},
): string[] {
  if (entry.displayLabel) {
    return [shortcutDisplayLabel(entry, opts)];
  }
  return entry.displayTokens.map((token) => formatDisplayToken(token, opts));
}

export function shortcutDisplayLabel(
  entry: ShortcutEntry,
  opts: { isMac?: boolean } = {},
): string {
  const label = entry.displayLabel ?? entry.displayTokens.join(" + ");
  return formatShortcutLabel(label, opts);
}

/**
 * Render a canonical `Mod+B` shortcut for the platform: `⌘B` on macOS,
 * `Ctrl+B` elsewhere. Returns `undefined` for tools without a shortcut.
 */
export function formatShortcut(
  shortcut: string | undefined,
  isMac: boolean,
): string | undefined {
  if (!shortcut) {
    return undefined;
  }
  if (isMac) {
    return shortcut.replace(/Mod\+?/g, "⌘").replace(/Shift\+?/g, "⇧");
  }
  return shortcut.replace(/Mod/g, "Ctrl");
}

export function matchesShortcut(id: ShortcutId, event: KeyEventLike): boolean {
  return matchesKey(shortcutById(id).match, event);
}

export function matchesKey(
  match: KeyMatcherMetadata,
  event: KeyEventLike,
): boolean {
  const expectedKeys = Array.isArray(match.key) ? match.key : [match.key];
  const actualKey =
    match.caseInsensitive === false ? event.key : lower(event.key);
  const keyMatched = expectedKeys.some((key) => {
    const expectedKey = match.caseInsensitive === false ? key : lower(key);
    return actualKey === expectedKey;
  });
  if (!keyMatched) {
    return false;
  }
  if (
    match.primaryModifier === "required" &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    return false;
  }
  if (
    match.primaryModifier === "forbidden" &&
    (event.ctrlKey || event.metaKey)
  ) {
    return false;
  }
  return (
    modifierMatches(match.ctrlKey, event.ctrlKey) &&
    modifierMatches(match.metaKey, event.metaKey) &&
    modifierMatches(match.altKey, event.altKey) &&
    modifierMatches(match.shiftKey, event.shiftKey)
  );
}
