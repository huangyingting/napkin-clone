import type { JSX } from "react";

import type { ShapeElement, SlideElement } from "@/lib/presentation/deck";
import type { ShapeToken } from "@/lib/presentation/deck-theme-tokens";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";

import { boxStyle, contrastTextColor, renderRuns } from "./primitives";

function ShapeText({ element }: { element: ShapeElement }): JSX.Element | null {
  const text = element.text?.trim();
  if (!text || element.shape === "line") return null;
  const style = element.textStyle ?? {
    fontSize: SLIDE_TEXT_FONT_SIZE.text,
    bold: false,
    italic: false,
    align: "center" as const,
  };
  const color = style.color ?? contrastTextColor(element.color);
  return (
    <div
      style={{
        position: "absolute",
        inset: "8%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontSize: `${style.fontSize}cqh`,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? "italic" : "normal",
        ...(style.underline ? { textDecoration: "underline" } : {}),
        ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
        textAlign: style.align,
        lineHeight: 1.15,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        overflowWrap: "break-word",
        wordBreak: "normal",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: "100%" }}>
        {element.textRuns && element.textRuns.length > 0
          ? renderRuns(element.textRuns)
          : element.text}
      </div>
    </div>
  );
}

export function ShapeElementView({
  element,
  elements: _elements,
  defaults,
}: {
  element: ShapeElement;
  elements: readonly SlideElement[];
  /** Deck-template shape defaults applied when the element omits a field (#607). */
  defaults?: ShapeToken;
}): JSX.Element {
  // Effective stroke: element stroke wins, else a deck-template default stroke
  // (#607) when the token defines one. Built-in themes set no shape stroke token.
  const effStroke =
    element.stroke ??
    (defaults?.stroke
      ? { color: defaults.stroke, width: defaults.strokeWidth ?? 0.4 }
      : undefined);
  if (element.shape === "line") {
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
            backgroundColor: effStroke?.color ?? element.color,
          }}
        />
      </div>
    );
  }
  if (element.shape === "triangle") {
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
            backgroundColor: element.color,
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
          }}
        />
        <ShapeText element={element} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...boxStyle(element),
        overflow: "hidden",
        backgroundColor: element.color,
        borderRadius:
          element.shape === "ellipse"
            ? "9999px"
            : element.radius !== undefined
              ? `${element.radius}%`
              : "0.25rem",
        ...(effStroke
          ? {
              border: `${effStroke.width}cqmin solid ${effStroke.color}`,
            }
          : {}),
      }}
    >
      <ShapeText element={element} />
    </div>
  );
}
