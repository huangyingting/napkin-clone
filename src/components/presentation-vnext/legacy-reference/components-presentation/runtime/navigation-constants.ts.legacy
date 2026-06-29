/**
 * Pure presentation navigation types, constants, and utilities.
 * No browser APIs or React hooks — safe to import from any context.
 */

import {
  shortcutById,
  shortcutDisplayTokens,
  type ShortcutId,
} from "@/lib/shortcuts/catalog";

export type PresentationShortcutAction =
  | "next"
  | "previous"
  | "first"
  | "last"
  | "help"
  | "exit"
  | "fullscreen"
  | "notes"
  | "overview"
  | "timer"
  | "laser";

export const PRESENTATION_NAVIGATION_SHORTCUT_IDS = {
  next: "presentation.next",
  previous: "presentation.previous",
  first: "presentation.first",
  last: "presentation.last",
} as const satisfies Partial<Record<PresentationShortcutAction, ShortcutId>>;

export type PresentationShortcutIdMap = Partial<
  Record<PresentationShortcutAction, ShortcutId>
>;

export type PresentationShortcutRow = {
  id: ShortcutId;
  action: PresentationShortcutAction;
  keys: string[];
  description: string;
};

export function presentationShortcutRows(
  shortcuts: PresentationShortcutIdMap,
): PresentationShortcutRow[] {
  return Object.entries(shortcuts).map(([action, id]) => {
    const entry = shortcutById(id);
    return {
      id,
      action: action as PresentationShortcutAction,
      keys: shortcutDisplayTokens(entry),
      description: entry.description,
    };
  });
}
