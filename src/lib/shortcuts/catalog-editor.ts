import type { ShortcutEntry, ShortcutId } from "./catalog-types";
import { modKey, modShiftKey } from "./catalog-keys";

function textTool(
  id: ShortcutId,
  description: string,
  key: string,
  canonical: string,
  shift = false,
): ShortcutEntry {
  return {
    id,
    scope: "Editor",
    surface: "text-toolbar",
    match: shift ? modShiftKey(key) : modKey(key),
    displayTokens: canonical.split("+"),
    canonical,
    description,
    handler: "browser-editor",
    allowInTextInput: true,
  };
}

export const EDITOR_SHORTCUTS: readonly ShortcutEntry[] = [
  {
    id: "editor.toggle-preview",
    scope: "Editor",
    surface: "document-editor",
    match: modKey("e"),
    displayTokens: ["Mod", "E"],
    canonical: "Mod+E",
    description: "Toggle Write / Preview",
    handler: "global",
    allowInTextInput: true,
  },
  textTool("editor.format.bold", "Bold", "b", "Mod+B"),
  textTool("editor.format.italic", "Italic", "i", "Mod+I"),
  textTool("editor.format.underline", "Underline", "u", "Mod+U"),
  textTool("editor.format.inline-code", "Inline code", "e", "Mod+E"),
  textTool("editor.align.left", "Align left", "l", "Mod+Shift+L", true),
  textTool("editor.align.center", "Align center", "e", "Mod+Shift+E", true),
  textTool("editor.align.right", "Align right", "r", "Mod+Shift+R", true),
  textTool("editor.align.justify", "Justify", "j", "Mod+Shift+J", true),
];

export const EDITOR_TEXT_TOOL_SHORTCUT_IDS = [
  "editor.format.bold",
  "editor.format.italic",
  "editor.format.underline",
  "editor.format.inline-code",
  "editor.align.left",
  "editor.align.center",
  "editor.align.right",
  "editor.align.justify",
] as const satisfies readonly ShortcutId[];
