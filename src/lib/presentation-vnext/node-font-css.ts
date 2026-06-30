import type { CSSProperties } from "react";

import type { StyleObject, StylePatch } from "./style-schema";

type NodeTextStyle =
  | Pick<StyleObject, "text">
  | Pick<StylePatch, "text">
  | undefined;

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
  return {
    ...(typeof text.fontFamily === "string"
      ? { fontFamily: text.fontFamily }
      : {}),
    ...(typeof text.fontSizePt === "number"
      ? { fontSize: `${text.fontSizePt}pt` }
      : {}),
    ...(typeof text.weight === "number" ? { fontWeight: text.weight } : {}),
    ...(text.italic ? { fontStyle: "italic" } : {}),
    ...(text.underline ? { textDecoration: "underline" } : {}),
    ...(typeof text.color === "string" ? { color: text.color } : {}),
    ...(typeof text.lineHeight === "number"
      ? { lineHeight: text.lineHeight }
      : {}),
    ...(text.align ? { textAlign: text.align } : {}),
  };
}
