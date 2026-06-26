import type { ShortcutEntry } from "./catalog-types";
import { bareKey } from "./catalog-keys";

export const GLOBAL_SHORTCUTS: readonly ShortcutEntry[] = [
  {
    id: "global.help",
    scope: "Global",
    surface: "app-shell",
    match: {
      key: "?",
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    displayTokens: ["?"],
    canonical: "?",
    description: "Show keyboard shortcuts",
    handler: "global",
    allowInTextInput: false,
  },
  {
    id: "dashboard.new-document",
    scope: "Dashboard",
    surface: "dashboard",
    match: bareKey("n"),
    displayTokens: ["N"],
    canonical: "N",
    description: "Create a new document",
    handler: "global",
    allowInTextInput: false,
  },
];
