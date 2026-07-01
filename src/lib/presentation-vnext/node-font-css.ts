import type { CSSProperties } from "react";

import type { StyleObject, StylePatch } from "./style-schema";

type NodeTextStyle =
  | Pick<StyleObject, "text">
  | Pick<StylePatch, "text">
  | undefined;

function getTextDecoration(
  text: StyleObject["text"] | StylePatch["text"],
): string | undefined {
  const textDecoration = [
    text?.underline ? "underline" : undefined,
    text?.strikethrough ? "line-through" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return textDecoration.length > 0 ? textDecoration : undefined;
}

/**
 * Resolves v7 node text style to CSS used by live inline text editing.
 *
 * The editor receives already-resolved render-tree style objects, so this
 * helper intentionally maps the resolved text style shape rather than looking
 * up theme tokens again.
 */
export function resolveNodeFontCss(style: NodeTextStyle): CSSProperties {
  const text = style?.text;
  if (!text) return {};
  const textDecoration = getTextDecoration(text);
  return {
    ...(typeof text.fontFamily === "string"
      ? { fontFamily: text.fontFamily }
      : {}),
    ...(typeof text.fontSizePt === "number"
      ? { fontSize: `${text.fontSizePt}pt` }
      : {}),
    ...(typeof text.weight === "number" ? { fontWeight: text.weight } : {}),
    ...(text.italic ? { fontStyle: "italic" } : {}),
    ...(textDecoration ? { textDecoration } : {}),
    ...(typeof text.color === "string" ? { color: text.color } : {}),
    ...(typeof text.lineHeight === "number"
      ? { lineHeight: text.lineHeight }
      : {}),
    ...(text.align ? { textAlign: text.align } : {}),
  };
}
