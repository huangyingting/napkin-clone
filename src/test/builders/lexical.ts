import type { Visual } from "@/lib/visual/schema";
import { buildVisual } from "./visual";

export const FORMAT_BOLD = 1;
export const FORMAT_ITALIC = 2;
export const FORMAT_CODE = 16;

export type SerializedFixtureTextNode = {
  detail: number;
  format: number;
  mode: "normal";
  style: string;
  text: string;
  type: "text";
  version: number;
};

type TextContainerFields = {
  bid?: string;
  children: SerializedFixtureTextNode[];
  direction: null;
  format: "";
  indent: number;
  version: number;
};

export type SerializedFixtureParagraphNode = TextContainerFields & {
  type: "paragraph";
  textFormat: number;
  textStyle: string;
};

export type SerializedFixtureHeadingNode = TextContainerFields & {
  type: "heading";
  tag: "h1" | "h2" | "h3";
};

export type SerializedFixtureQuoteNode = TextContainerFields & {
  type: "quote";
};

export type SerializedFixtureListItemNode = TextContainerFields & {
  type: "listitem";
  value: number;
};

export type SerializedFixtureListNode = {
  bid?: string;
  children: SerializedFixtureListItemNode[];
  direction: null;
  format: "";
  indent: number;
  listType: "bullet" | "number";
  start: number;
  tag: "ul" | "ol";
  type: "list";
  version: number;
};

export type SerializedFixtureHorizontalRuleNode = {
  bid?: string;
  type: "horizontalrule";
  version: number;
};

export type SerializedFixtureVisualNode = {
  type: "visual";
  version: number;
  visual: Visual;
  visualId: string;
};

export type SerializedFixtureRootChild =
  | SerializedFixtureParagraphNode
  | SerializedFixtureHeadingNode
  | SerializedFixtureQuoteNode
  | SerializedFixtureListNode
  | SerializedFixtureHorizontalRuleNode
  | SerializedFixtureVisualNode;

export type SerializedFixtureEditorState = {
  root: {
    children: SerializedFixtureRootChild[];
    direction: null;
    format: "";
    indent: number;
    type: "root";
    version: number;
  };
};

export function buildTextNode(
  text: string,
  overrides: Partial<SerializedFixtureTextNode> = {},
): SerializedFixtureTextNode {
  return {
    detail: overrides.detail ?? 0,
    format: overrides.format ?? 0,
    mode: overrides.mode ?? "normal",
    style: overrides.style ?? "",
    text: overrides.text ?? text,
    type: "text",
    version: overrides.version ?? 1,
  };
}

function textContainer(
  children: SerializedFixtureTextNode[],
  overrides: Partial<TextContainerFields> = {},
): TextContainerFields {
  return {
    bid: overrides.bid,
    children: overrides.children ?? children,
    direction: overrides.direction ?? null,
    format: overrides.format ?? "",
    indent: overrides.indent ?? 0,
    version: overrides.version ?? 1,
  };
}

export function buildParagraphNode(
  textOrChildren: string | SerializedFixtureTextNode[] = "",
  overrides: Partial<SerializedFixtureParagraphNode> = {},
): SerializedFixtureParagraphNode {
  const children =
    typeof textOrChildren === "string"
      ? textOrChildren === ""
        ? []
        : [buildTextNode(textOrChildren)]
      : textOrChildren;
  return {
    ...textContainer(children, overrides),
    type: "paragraph",
    textFormat: overrides.textFormat ?? 0,
    textStyle: overrides.textStyle ?? "",
  };
}

export function buildHeadingNode(
  level: 1 | 2 | 3,
  text: string,
  overrides: Partial<SerializedFixtureHeadingNode> = {},
): SerializedFixtureHeadingNode {
  return {
    ...textContainer([buildTextNode(text)], overrides),
    type: "heading",
    tag: overrides.tag ?? `h${level}`,
  };
}

export function buildQuoteNode(
  text: string,
  overrides: Partial<SerializedFixtureQuoteNode> = {},
): SerializedFixtureQuoteNode {
  return {
    ...textContainer([buildTextNode(text)], overrides),
    type: "quote",
  };
}

export function buildListItemNode(
  text: string,
  overrides: Partial<SerializedFixtureListItemNode> = {},
): SerializedFixtureListItemNode {
  return {
    ...textContainer([buildTextNode(text)], overrides),
    type: "listitem",
    value: overrides.value ?? 1,
  };
}

export function buildListNode(
  items: string[],
  overrides: Partial<SerializedFixtureListNode> = {},
): SerializedFixtureListNode {
  const listType = overrides.listType ?? "bullet";
  return {
    bid: overrides.bid,
    children:
      overrides.children ?? items.map((item) => buildListItemNode(item)),
    direction: overrides.direction ?? null,
    format: overrides.format ?? "",
    indent: overrides.indent ?? 0,
    listType,
    start: overrides.start ?? 1,
    tag: overrides.tag ?? (listType === "number" ? "ol" : "ul"),
    type: "list",
    version: overrides.version ?? 1,
  };
}

export function buildHorizontalRuleNode(
  overrides: Partial<SerializedFixtureHorizontalRuleNode> = {},
): SerializedFixtureHorizontalRuleNode {
  return {
    bid: overrides.bid,
    type: "horizontalrule",
    version: overrides.version ?? 1,
  };
}

export function buildVisualLexicalNode(
  visualId = "visual-fixture",
  visual: Visual = buildVisual(),
  overrides: Partial<SerializedFixtureVisualNode> = {},
): SerializedFixtureVisualNode {
  return {
    type: "visual",
    version: overrides.version ?? 1,
    visual: overrides.visual ?? visual,
    visualId: overrides.visualId ?? visualId,
  };
}

export function buildEditorState(
  children: SerializedFixtureRootChild[] = [
    buildParagraphNode("Fixture paragraph."),
  ],
): SerializedFixtureEditorState {
  return {
    root: {
      children,
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

export function buildContentJson(
  children: SerializedFixtureRootChild[] = [
    buildParagraphNode("Fixture paragraph."),
  ],
): string {
  return JSON.stringify(buildEditorState(children));
}
