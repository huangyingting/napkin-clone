import { SHORTCUT_REGISTRY } from "@/lib/shortcuts/catalog";

export function isAppShellShortcutHelpEnabled(): boolean {
  return SHORTCUT_REGISTRY.some(
    (shortcut) =>
      shortcut.surface === "app-shell" && shortcut.showInGlobalHelp !== false,
  );
}
