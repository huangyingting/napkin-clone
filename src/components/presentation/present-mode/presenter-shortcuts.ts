import {
  PRESENTATION_NAVIGATION_SHORTCUT_IDS,
  presentationShortcutRows,
  type PresentationShortcutIdMap,
} from "@/components/presentation/runtime/navigation";

export const PRESENT_MODE_SHORTCUT_IDS = {
  ...PRESENTATION_NAVIGATION_SHORTCUT_IDS,
  fullscreen: "presentation.fullscreen",
  exit: "presentation.exit",
  help: "presentation.help",
  notes: "presentation.notes",
  overview: "presentation.overview",
  timer: "presentation.timer",
  laser: "presentation.laser",
} as const satisfies PresentationShortcutIdMap;

export const PRESENT_MODE_SHORTCUTS = presentationShortcutRows(
  PRESENT_MODE_SHORTCUT_IDS,
);
