import type { JSX } from "react";

import type { ShapeElement, SlideElement } from "@/lib/presentation/deck";
import type {
  DeckThemeTokenSet,
  ShapeToken,
} from "@/lib/presentation/deck-theme-tokens";
import { resolveElementFontCss } from "@/lib/presentation/slide-fonts";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";

import { boxStyle, contrastTextColor, renderRuns } from "./primitives";
import {
  colorRefValue,
  elementDesignOverrides,
  shapeContent,
  shapeTextDesign,
} from "./v6-model";

function ShapeText({
  element,
  fillColor,
}: {
  element: ShapeElement;
  fillColor: string;
}): JSX.Element | null {
  const content = shapeContent(element);
  const text = content.text?.trim();
  if (!text || content.shape === "line") return null;
  const style = shapeTextDesign(element);
  const fontSize = style.fontSize ?? SLIDE_TEXT_FONT_SIZE.text;
  const align = style.align ?? "center";
  const color = style.color ?? contrastTextColor(fillColor);
  const fontCss = resolveElementFontCss(style.fontId);
  const bold = style.bold ?? false;
  const italic = style.italic ?? false;
  const underline = style.underline ?? false;
  const textRuns = content.textRuns;
  return (
    <div
      style={{
        position: "absolute",
        inset: "8%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontSize: `${fontSize}cqh`,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        ...(underline ? { textDecoration: "underline" } : {}),
        ...(fontCss ? { fontFamily: fontCss } : {}),
        textAlign: align,
        lineHeight: 1.15,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        overflowWrap: "break-word",
        wordBreak: "normal",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: "100%" }}>
        {textRuns && textRuns.length > 0 ? renderRuns(textRuns) : content.text}
      </div>
    </div>
  );
}

export function ShapeElementView({
  element,
  elements: _elements,
  tokenSet,
  defaults,
}: {
  element: ShapeElement;
  elements: readonly SlideElement[];
  tokenSet: DeckThemeTokenSet;
  /** Deck-template shape defaults applied when the element omits a field (#607). */
  defaults?: ShapeToken;
}): JSX.Element {
  const content = shapeContent(element);
  const design = elementDesignOverrides(element);
  const fillColor =
    colorRefValue(design.fill, tokenSet) ?? defaults?.fill ?? "#6366f1";
  // Effective stroke: element stroke wins, else a deck-template default stroke
  // (#607) when the token defines one. Built-in themes set no shape stroke token.
  const effStroke =
    (design.stroke as { color: string; width: number } | undefined) ??
    (defaults?.stroke
      ? { color: defaults.stroke, width: defaults.strokeWidth ?? 0.4 }
      : undefined);
  const radius = typeof design.radius === "number" ? design.radius : undefined;
  if (content.shape === "line") {
    return (
      <div
        style={{
          ...boxStyle(element),
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            height: `${effStroke?.width ?? 0.4}cqmin`,
            width: "100%",
            backgroundColor: effStroke?.color ?? fillColor,
          }}
        />
      </div>
    );
  }
  if (content.shape === "triangle") {
    return (
      <div
        style={{
          ...boxStyle(element),
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: fillColor,
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
          }}
        />
        <ShapeText element={element} fillColor={fillColor} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...boxStyle(element),
        overflow: "hidden",
        backgroundColor: fillColor,
        borderRadius:
          content.shape === "ellipse"
            ? "9999px"
            : radius !== undefined
              ? `${radius}%`
              : "0.25rem",
        ...(effStroke
          ? {
              border: `${effStroke.width}cqmin solid ${effStroke.color}`,
            }
          : {}),
      }}
    >
      <ShapeText element={element} fillColor={fillColor} />
    </div>
  );
}
