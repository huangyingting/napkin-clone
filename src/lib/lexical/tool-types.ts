import type { LexicalEditor } from "lexical";
import type { LucideIcon } from "lucide-react";

import type { ActionDescriptor } from "@/lib/actions/action-descriptor";
import type { ShortcutId } from "@/lib/shortcuts/catalog";

import type { EditorContextSnapshot } from "./selection-snapshot";

export type EditorToolGroup =
  | "text-format"
  | "block-insert"
  | "visual-insert"
  | "visual-edit"
  | "visual-style";

export type EditorToolSection = string;

export type EditorToolControl = "button" | "color";

export type EditorTool = {
  id: string;
  group: EditorToolGroup;
  label: string;
  icon?: LucideIcon;
  action: ActionDescriptor<never>;
  shortcut?: string;
  shortcutId?: ShortcutId;
  section?: EditorToolSection;
  control?: EditorToolControl;
  description?: string;
  keywords?: readonly string[];
  when(ctx: EditorContextSnapshot): boolean;
  isActive?(ctx: EditorContextSnapshot): boolean;
  run?(editor: LexicalEditor, ctx: EditorContextSnapshot): void;
  value?(ctx: EditorContextSnapshot): string;
  apply?(editor: LexicalEditor, value: string | null): void;
};
