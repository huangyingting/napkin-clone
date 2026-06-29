import type { JSX } from "react";

import type { ShapeElement, SlideElement } from "@/lib/presentation/deck";
import {
  type ResolvedSlideCanvas,
  resolvedFillRepresentativeColor,
  resolvedFillToCss,
  type ResolvedElementDesign,
  type ResolvedElementFill,
} from "@/lib/presentation/slide-render-model";
import {
  inscribedElementBox,
  isInscribedShape,
  relativeBox,
} from "@/lib/presentation/shape-geometry";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";

import {
  boxStyle,
  contrastTextColor,
  hexToRgba,
  renderRuns,
} from "./primitives";
import { shapeContent, shapeTextDesign } from "./v6-model";

type ResolvedShapeDesign = Extract<ResolvedElementDesign, { kind: "shape" }>;

const GLASS_PRESETS = {
  light: { alpha: 0.05, blur: 6, saturate: 1.16, borderAlpha: 0.12 },
  medium: { alpha: 0.3, blur: 14, saturate: 1.3, borderAlpha: 0.5 },
  strong: { alpha: 0.4, blur: 22, saturate: 1.42, borderAlpha: 0.6 },
} as const;

function radiusCss(
  radius: ResolvedShapeDesign["radius"] | undefined,
  fallback = "0.25rem",
): string {
  if (radius === undefined) return fallback;
  if (typeof radius === "number")
    return radius >= 50 ? "9999px" : `${radius}cqmin`;
  return `${radius.topLeft}cqmin ${radius.topRight}cqmin ${radius.bottomRight}cqmin ${radius.bottomLeft}cqmin`;
}

function glassFillCss(fill: ResolvedElementFill, alpha: number): string {
  if (typeof fill === "string") return hexToRgba(fill, alpha);
  if (fill.type === "linearGradient") {
    if (fill.stops) {
      return `linear-gradient(${fill.angle ?? 90}deg, ${fill.stops
        .map(
          (stop) =>
            `${hexToRgba(stop.color, alpha + 0.08)}${stop.offset !== undefined ? ` ${stop.offset}%` : ""}`,
        )
        .join(", ")})`;
    }
    return `linear-gradient(${fill.angle ?? 90}deg, ${hexToRgba(
      fill.from,
      alpha + 0.08,
    )}, ${hexToRgba(fill.to, alpha)})`;
  }
  const rx = fill.rx ?? fill.r ?? 70;
  const ry = fill.ry ?? fill.r ?? 70;
  if (fill.stops) {
    return `radial-gradient(${rx}% ${ry}% at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${fill.stops
      .map(
        (stop) =>
          `${hexToRgba(stop.color, alpha + 0.08)}${stop.offset !== undefined ? ` ${stop.offset}%` : ""}`,
      )
      .join(", ")})`;
  }
  return `radial-gradient(${rx}% ${ry}% at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${hexToRgba(
    fill.inner,
    alpha + 0.08,
  )}, ${hexToRgba(fill.outer, alpha)})`;
}

function fillBoxStyle(
  fill: ResolvedElementFill,
  effect: ResolvedShapeDesign["effect"],
): React.CSSProperties {
  if (!effect) return { background: resolvedFillToCss(fill) };
  if (effect.kind === "blur") {
    return {
      background: resolvedFillToCss(fill),
      filter: `blur(${effect.radius}cqmin)`,
    };
  }
  if (effect.kind === "glow") {
    return {
      background: resolvedFillToCss(fill),
      filter: `drop-shadow(0 0 ${effect.blur}cqmin ${hexToRgba(effect.color, effect.opacity ?? 1)})`,
    };
  }
  const preset = GLASS_PRESETS[effect.intensity];
  return {
    background: glassFillCss(fill, preset.alpha),
    backdropFilter: `blur(${preset.blur}px) saturate(${preset.saturate})`,
    WebkitBackdropFilter: `blur(${preset.blur}px) saturate(${preset.saturate})`,
    boxShadow: "0 0.8cqmin 2.4cqmin rgba(15, 23, 42, 0.18)",
    border: `1px solid ${hexToRgba("#ffffff", preset.borderAlpha)}`,
  };
}

function ShapeText({
  element,
  fillColor,
  resolvedDesign,
}: {
  element: ShapeElement;
  fillColor: string;
  resolvedDesign?: ResolvedShapeDesign;
}): JSX.Element | null {
  const content = shapeContent(element);
  const text = content.text?.trim();
  if (!text || content.shape === "line") return null;
  const style = shapeTextDesign(element);
  const textStyle = resolvedDesign?.textStyle;
  const fontSize =
    textStyle?.fontSize ?? style.fontSize ?? SLIDE_TEXT_FONT_SIZE.text;
  const align = textStyle?.align ?? style.align ?? "center";
  const color = textStyle?.color ?? style.color ?? contrastTextColor(fillColor);
  const fontCss = textStyle?.fontFamily;
  const bold = textStyle ? textStyle.weight >= 600 : (style.bold ?? false);
  const italic = textStyle?.italic ?? style.italic ?? false;
  const underline = textStyle?.underline ?? style.underline ?? false;
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
        ...(textStyle?.letterSpacing !== undefined
          ? { letterSpacing: `${textStyle.letterSpacing}em` }
          : {}),
        ...(textStyle?.textTransform
          ? { textTransform: textStyle.textTransform }
          : {}),
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
  canvas,
  resolvedDesign,
}: {
  element: ShapeElement;
  elements: readonly SlideElement[];
  canvas: ResolvedSlideCanvas;
  resolvedDesign?: ResolvedShapeDesign;
}): JSX.Element {
  const content = shapeContent(element);
  const fill = resolvedDesign?.fill ?? "#6366f1";
  const fillColor = resolvedFillRepresentativeColor(fill);
  const effStroke = resolvedDesign?.stroke;
  const radius = resolvedDesign?.radius;
  const fillStyle = fillBoxStyle(fill, resolvedDesign?.effect);
  if (isInscribedShape(content.shape)) {
    const inner = relativeBox(
      inscribedElementBox(content.shape, element.box, canvas),
      element.box,
    );
    return (
      <div
        style={{
          ...boxStyle(element),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${inner.x}%`,
            top: `${inner.y}%`,
            width: `${inner.w}%`,
            height: `${inner.h}%`,
            overflow: "hidden",
            ...fillStyle,
            borderRadius:
              content.shape === "circle"
                ? "9999px"
                : radius !== undefined
                  ? radiusCss(radius)
                  : "0.25rem",
            ...(effStroke
              ? {
                  border: `${effStroke.width}cqmin solid ${effStroke.color}`,
                }
              : {}),
          }}
        >
          <ShapeText
            element={element}
            fillColor={fillColor}
            resolvedDesign={resolvedDesign}
          />
        </div>
      </div>
    );
  }
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
            height: effStroke?.width ? `${effStroke.width}cqmin` : "100%",
            width: "100%",
            background: effStroke?.color ?? resolvedFillToCss(fill),
          }}
        />
      </div>
    );
  }
  if (content.shape === "ellipse" && resolvedDesign?.effect?.kind === "blur") {
    return (
      <div
        style={{
          ...boxStyle(element),
          background: resolvedFillToCss(fill),
          borderRadius: "50%",
          filter: `blur(${resolvedDesign.effect.radius}cqmin)`,
        }}
      />
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
            ...fillStyle,
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
          }}
        />
        <ShapeText
          element={element}
          fillColor={fillColor}
          resolvedDesign={resolvedDesign}
        />
      </div>
    );
  }
  if (content.shape === "diamond") {
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
            ...fillStyle,
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
          }}
        />
        <ShapeText
          element={element}
          fillColor={fillColor}
          resolvedDesign={resolvedDesign}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        ...boxStyle(element),
        overflow: "hidden",
        ...fillStyle,
        borderRadius:
          content.shape === "ellipse"
            ? "50%"
            : radius !== undefined
              ? radiusCss(radius)
              : "0.25rem",
        ...(effStroke
          ? {
              border: `${effStroke.width}cqmin solid ${effStroke.color}`,
            }
          : {}),
      }}
    >
      <ShapeText
        element={element}
        fillColor={fillColor}
        resolvedDesign={resolvedDesign}
      />
    </div>
  );
}
