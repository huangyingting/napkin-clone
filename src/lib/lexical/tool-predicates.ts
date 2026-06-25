import type { ElementFormatType } from "lexical";

import type { EditorContextSnapshot } from "./selection-snapshot";

export const TOOL_VISIBILITY = {
  rangeSelection: (ctx: EditorContextSnapshot): boolean =>
    ctx.editable && ctx.kind === "range",
  editable: (ctx: EditorContextSnapshot): boolean => ctx.editable,
} as const;

export type ToolVisibilityName = keyof typeof TOOL_VISIBILITY;

function isAlignmentActive(
  format: EditorContextSnapshot["elementFormat"],
  target: ElementFormatType,
): boolean {
  if (target === "left") {
    return format === "left" || format === "start" || format === "";
  }
  return format === target;
}

export const TOOL_ACTIVE = {
  bold: (ctx: EditorContextSnapshot) => ctx.activeFormats.has("bold"),
  italic: (ctx: EditorContextSnapshot) => ctx.activeFormats.has("italic"),
  underline: (ctx: EditorContextSnapshot) => ctx.activeFormats.has("underline"),
  strikethrough: (ctx: EditorContextSnapshot) =>
    ctx.activeFormats.has("strikethrough"),
  code: (ctx: EditorContextSnapshot) => ctx.activeFormats.has("code"),
  link: (ctx: EditorContextSnapshot) => ctx.isLink,
  h1: (ctx: EditorContextSnapshot) => ctx.blockType === "h1",
  h2: (ctx: EditorContextSnapshot) => ctx.blockType === "h2",
  h3: (ctx: EditorContextSnapshot) => ctx.blockType === "h3",
  quote: (ctx: EditorContextSnapshot) => ctx.blockType === "quote",
  bullet: (ctx: EditorContextSnapshot) => ctx.blockType === "bullet",
  number: (ctx: EditorContextSnapshot) => ctx.blockType === "number",
  alignLeft: (ctx: EditorContextSnapshot) =>
    isAlignmentActive(ctx.elementFormat, "left"),
  alignCenter: (ctx: EditorContextSnapshot) =>
    isAlignmentActive(ctx.elementFormat, "center"),
  alignRight: (ctx: EditorContextSnapshot) =>
    isAlignmentActive(ctx.elementFormat, "right"),
  alignJustify: (ctx: EditorContextSnapshot) =>
    isAlignmentActive(ctx.elementFormat, "justify"),
  textColor: (ctx: EditorContextSnapshot) => ctx.textColor !== "",
  highlightColor: (ctx: EditorContextSnapshot) => ctx.highlightColor !== "",
} as const;

export type ToolActiveName = keyof typeof TOOL_ACTIVE;

export const TOOL_VALUES = {
  textColor: (ctx: EditorContextSnapshot) => ctx.textColor,
  highlightColor: (ctx: EditorContextSnapshot) => ctx.highlightColor,
} as const;

export type ToolValueName = keyof typeof TOOL_VALUES;
