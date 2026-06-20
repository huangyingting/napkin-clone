/**
 * Catalog of the application's keyboard shortcuts.
 *
 * This module is intentionally framework-free (no React/DOM imports) so it can
 * be unit-tested and reused both by the discoverable help dialog and anywhere a
 * human-readable list of shortcuts is needed.
 */

export type ShortcutScope = "Global" | "Dashboard" | "Editor";

export type ShortcutEntry = {
  /** Display tokens for the key combo, e.g. `["Ctrl/⌘", "E"]` or `["?"]`. */
  keys: string[];
  /** What the shortcut does. */
  description: string;
  /** Where the shortcut applies, used to group entries in the help dialog. */
  scope: ShortcutScope;
};

/** Ordered scopes for grouping entries in the help dialog. */
export const SHORTCUT_SCOPES: ShortcutScope[] = [
  "Global",
  "Dashboard",
  "Editor",
];

const SHORTCUTS: ShortcutEntry[] = [
  { keys: ["?"], description: "Show keyboard shortcuts", scope: "Global" },
  { keys: ["N"], description: "Create a new document", scope: "Dashboard" },
  {
    keys: ["Ctrl/⌘", "E"],
    description: "Toggle Write / Preview",
    scope: "Editor",
  },
];

/** Returns the shortcuts that belong to a given scope, in catalog order. */
export function shortcutsForScope(scope: ShortcutScope): ShortcutEntry[] {
  return SHORTCUTS.filter((entry) => entry.scope === scope);
}
