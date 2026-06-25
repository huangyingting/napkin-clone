import type { JSX } from "react";

import type { PlaceholderElement } from "@/lib/presentation/deck";
import { PLACEHOLDER_TYPE_LABELS } from "@/lib/presentation/deck";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";

import { boxStyle, hexToRgba } from "./primitives";

export function PlaceholderElementView({
  element,
  tc,
  accent,
  editable,
}: {
  element: PlaceholderElement;
  tc: SlideThemeColors;
  accent: string;
  editable?: boolean;
}): JSX.Element {
  const label =
    element.label?.trim() || PLACEHOLDER_TYPE_LABELS[element.placeholderType];
  return (
    <div
      style={{
        ...boxStyle(element),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1cqmin",
        overflow: "hidden",
        borderRadius: "0.6em",
        border: `1.5px dashed ${hexToRgba(accent, 0.55)}`,
        backgroundColor: hexToRgba(accent, 0.12),
        color: tc.mutedColor,
        fontSize: "3.2cqh",
        fontWeight: 600,
        lineHeight: 1.2,
        textAlign: "center",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "normal",
        userSelect: "none",
        pointerEvents: editable ? "auto" : "none",
      }}
    >
      <span>{label}</span>
    </div>
  );
}
