import valueParser from "postcss-value-parser";

import {
  type Box,
  type ColorRef,
  type ColorToken,
  type Fill,
  type ShapeEffect,
  type ShapeKind,
  shape,
} from "./theme-kit";

export type CssLength = number | string;

export interface CssLikeStyle {
  left?: CssLength;
  top?: CssLength;
  width?: CssLength;
  height?: CssLength;
  background?: string | Fill;
  border?: string;
  borderRadius?: CssLength;
  opacity?: number;
  rotate?: number | string;
  backdropFilter?: string;
  filter?: string;
}

export interface SlideCanvasSize {
  width: number;
  height: number;
}

export const DEFAULT_LAYOUT_CANVAS: SlideCanvasSize = {
  width: 1600,
  height: 900,
};

export interface CssBoxEdges<T> {
  top: T;
  right: T;
  bottom: T;
  left: T;
}

const TOKEN_BY_CSS_VAR: Record<string, ColorToken> = {
  "--slide-bg": "slideBg",
  "--slideBg": "slideBg",
  "--surface": "surface",
  "--accent": "accent",
  "--on-bg": "onBg",
  "--onBg": "onBg",
  "--on-surface": "onSurface",
  "--onSurface": "onSurface",
  "--on-accent": "onAccent",
  "--onAccent": "onAccent",
  "--muted": "muted",
};

export function style(...parts: Array<CssLikeStyle | undefined>): CssLikeStyle {
  return Object.assign({}, ...parts.filter(Boolean));
}

export const compose = style;

function finite(value: string, context: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${context} must be a finite number`);
  }
  return parsed;
}

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseCssLengthUnit(
  input: CssLength,
  context: string,
): { value: number; unit: string } {
  if (typeof input === "number") return { value: input, unit: "" };
  const unit = valueParser.unit(input.trim());
  if (!unit) throw new Error(`${context} has an unsupported length: ${input}`);
  return { value: finite(unit.number, context), unit: unit.unit };
}

function scalarLength(
  input: CssLength,
  context: string,
  units: readonly string[],
): number {
  const parsed = parseCssLengthUnit(input, context);
  if (!units.includes(parsed.unit)) {
    throw new Error(
      `${context} only supports ${units.join(", ") || "unitless"}`,
    );
  }
  return parsed.value;
}

export function resolveLayoutLength(
  input: CssLength,
  axis: "x" | "y" | "min",
  parent: { width: number; height: number },
  canvas: SlideCanvasSize = DEFAULT_LAYOUT_CANVAS,
  context = "length",
): number {
  const parsed = parseCssLengthUnit(input, context);
  if (parsed.unit === "") return parsed.value;
  if (parsed.unit === "%") {
    const base =
      axis === "y"
        ? parent.height
        : axis === "min"
          ? Math.min(parent.width, parent.height)
          : parent.width;
    return (parsed.value / 100) * base;
  }
  if (parsed.unit === "cqw") return (parsed.value / 100) * canvas.width;
  if (parsed.unit === "cqh") return (parsed.value / 100) * canvas.height;
  if (parsed.unit === "cqmin") {
    return (parsed.value / 100) * Math.min(canvas.width, canvas.height);
  }
  throw new Error(`${context} only supports %, cqw, cqh, and cqmin`);
}

function lengthToSlidePercent(
  input: CssLength,
  axis: "x" | "y",
  canvas: SlideCanvasSize,
  context: string,
): number {
  const px = resolveLayoutLength(
    input,
    axis,
    { width: canvas.width, height: canvas.height },
    canvas,
    context,
  );
  return (px / (axis === "y" ? canvas.height : canvas.width)) * 100;
}

export function boxFromStyle(
  input: CssLikeStyle,
  canvas: SlideCanvasSize = DEFAULT_LAYOUT_CANVAS,
): Box {
  if (
    input.left === undefined ||
    input.top === undefined ||
    input.width === undefined ||
    input.height === undefined
  ) {
    throw new Error("box style requires left, top, width, and height");
  }
  return {
    x: lengthToSlidePercent(input.left, "x", canvas, "left"),
    y: lengthToSlidePercent(input.top, "y", canvas, "top"),
    w: lengthToSlidePercent(input.width, "x", canvas, "width"),
    h: lengthToSlidePercent(input.height, "y", canvas, "height"),
  };
}

export function parseSpacingValues(
  input: CssLength | undefined,
  context = "spacing",
): CssBoxEdges<CssLength> {
  if (input === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof input === "number") {
    return { top: input, right: input, bottom: input, left: input };
  }
  const parts = valueParser(input)
    .nodes.filter((node) => node.type !== "space")
    .map((node) => valueParser.stringify(node));
  if (parts.length < 1 || parts.length > 4) {
    throw new Error(`${context} supports 1 to 4 length values`);
  }
  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
}

export function parseSpacing(
  input: CssLength | undefined,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize = DEFAULT_LAYOUT_CANVAS,
  context = "spacing",
): CssBoxEdges<number> {
  const values = parseSpacingValues(input, context);
  return {
    top: resolveLayoutLength(values.top, "y", parent, canvas, `${context}.top`),
    right: resolveLayoutLength(
      values.right,
      "x",
      parent,
      canvas,
      `${context}.right`,
    ),
    bottom: resolveLayoutLength(
      values.bottom,
      "y",
      parent,
      canvas,
      `${context}.bottom`,
    ),
    left: resolveLayoutLength(
      values.left,
      "x",
      parent,
      canvas,
      `${context}.left`,
    ),
  };
}

function splitComma(nodes: valueParser.Node[]): valueParser.Node[][] {
  const groups: valueParser.Node[][] = [[]];
  for (const node of nodes) {
    if (node.type === "div" && node.value === ",") {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(node);
    }
  }
  return groups;
}

function stringifyNodes(nodes: valueParser.Node[]): string {
  return valueParser.stringify(nodes).trim();
}

function colorRefFromValue(input: string): ColorRef {
  const parsed = valueParser(input.trim());
  const only = parsed.nodes.filter((node) => node.type !== "space");
  if (only.length === 0) throw new Error("Color value must not be empty");
  const color = only[0];
  if (color.type === "function" && color.value === "var") {
    const variable = stringifyNodes(color.nodes);
    const token = TOKEN_BY_CSS_VAR[variable];
    if (!token) throw new Error(`Unsupported color token ${variable}`);
    return { token };
  }
  if (color.type === "word" && HEX_COLOR_RE.test(color.value)) {
    return { value: color.value };
  }
  throw new Error(`Unsupported color value ${input.trim()}`);
}

function percentNumber(input: string, context: string): number {
  const parsed = valueParser.unit(input);
  if (!parsed || (parsed.unit !== "" && parsed.unit !== "%")) {
    throw new Error(`${context} only supports percentage numbers`);
  }
  return finite(parsed.number, context);
}

function parseRadialGradient(node: valueParser.FunctionNode): Fill {
  const parts = splitComma(node.nodes).map(stringifyNodes);
  if (parts.length < 3) {
    throw new Error("radial-gradient requires geometry and two color stops");
  }
  const geometry = parts[0].split(/\s+/).filter(Boolean);
  const at = geometry.indexOf("at");
  const radiusToken = geometry.find(
    (part, index) =>
      part !== "circle" && part !== "ellipse" && (at < 0 || index < at),
  );
  return {
    type: "radialGradient",
    inner: colorRefFromValue(parts[1]),
    outer: colorRefFromValue(parts[2]),
    r: radiusToken ? percentNumber(radiusToken, "radial-gradient radius") : 70,
    ...(at >= 0
      ? {
          cx: percentNumber(geometry[at + 1], "radial-gradient cx"),
          cy: percentNumber(geometry[at + 2], "radial-gradient cy"),
        }
      : {}),
  };
}

function parseLinearGradient(node: valueParser.FunctionNode): Fill {
  const parts = splitComma(node.nodes).map(stringifyNodes);
  if (parts.length < 2) {
    throw new Error("linear-gradient requires two color stops");
  }
  const first = valueParser.unit(parts[0]);
  const hasAngle = first !== false && first.unit === "deg";
  if ((hasAngle && parts.length !== 3) || (!hasAngle && parts.length !== 2)) {
    throw new Error(
      "linear-gradient supports only an optional angle and two color stops",
    );
  }
  return {
    type: "linearGradient",
    from: colorRefFromValue(hasAngle ? parts[1] : parts[0]),
    to: colorRefFromValue(hasAngle ? parts[2] : parts[1]),
    ...(hasAngle
      ? { angle: finite(first.number, "linear-gradient angle") }
      : {}),
  };
}

export function parseBackground(
  input: string | Fill | undefined,
): Fill | undefined {
  if (input === undefined || typeof input !== "string") return input;
  const parsed = valueParser(input.trim());
  const only = parsed.nodes.filter((node) => node.type !== "space");
  if (only.length === 1 && only[0].type === "function") {
    if (only[0].value === "radial-gradient")
      return parseRadialGradient(only[0]);
    if (only[0].value === "linear-gradient")
      return parseLinearGradient(only[0]);
  }
  return colorRefFromValue(input);
}

function parseRadius(input: CssLength | undefined): number | undefined {
  if (input === undefined) return undefined;
  const radius = scalarLength(input, "borderRadius", ["", "cqmin"]);
  if (radius < 0 || radius > 50) {
    throw new Error("borderRadius must be between 0 and 50cqmin");
  }
  return radius;
}

function parseAngle(input: number | string | undefined): number | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "number") return input;
  const parsed = parseCssLengthUnit(input, "rotate");
  if (parsed.unit !== "deg") throw new Error("rotate only supports deg");
  return parsed.value;
}

function parseBorder(
  input: string | undefined,
): { color: string; width: number } | undefined {
  if (!input) return undefined;
  const parts = valueParser(input)
    .nodes.filter((node) => node.type !== "space")
    .map((node) => valueParser.stringify(node));
  const widthParts = parts.filter((part) => Boolean(valueParser.unit(part)));
  const colorParts = parts.filter((part) => HEX_COLOR_RE.test(part));
  const unsupported = parts.filter(
    (part) =>
      !widthParts.includes(part) &&
      !colorParts.includes(part) &&
      part !== "solid",
  );
  if (
    widthParts.length !== 1 ||
    colorParts.length !== 1 ||
    unsupported.length > 0
  ) {
    throw new Error(
      "border supports only a width, optional solid style, and hex color, e.g. 0.2cqmin solid #ffffff",
    );
  }
  return {
    width: scalarLength(widthParts[0], "border width", ["", "cqmin"]),
    color: colorParts[0],
  };
}

function parseEffect(input: CssLikeStyle): ShapeEffect | undefined {
  if (input.backdropFilter) {
    const only = valueParser(input.backdropFilter).nodes.filter(
      (node) => node.type !== "space",
    );
    if (
      only.length === 1 &&
      only[0].type === "function" &&
      only[0].value === "glass"
    ) {
      const intensity = stringifyNodes(only[0].nodes);
      if (!["light", "medium", "strong"].includes(intensity)) {
        throw new Error("glass() intensity must be light, medium, or strong");
      }
      return {
        kind: "glass",
        intensity: intensity as "light" | "medium" | "strong",
      };
    }
    throw new Error("backdropFilter only supports glass(light|medium|strong)");
  }
  if (input.filter) {
    const only = valueParser(input.filter).nodes.filter(
      (node) => node.type !== "space",
    );
    if (
      only.length === 1 &&
      only[0].type === "function" &&
      only[0].value === "blur"
    ) {
      return {
        kind: "blur",
        radius: scalarLength(stringifyNodes(only[0].nodes), "blur", [
          "",
          "cqmin",
        ]),
      };
    }
    throw new Error("filter only supports blur(...)");
  }
  return undefined;
}

export function shapeFromStyle(opts: {
  zIndex: number;
  shape: ShapeKind;
  box: Box;
  style: CssLikeStyle;
  locked?: boolean;
  name?: string;
}): Record<string, unknown> {
  return shape({
    zIndex: opts.zIndex,
    shape: opts.shape,
    box: opts.box,
    fill: parseBackground(opts.style.background),
    stroke: parseBorder(opts.style.border),
    radius: parseRadius(opts.style.borderRadius),
    effect: parseEffect(opts.style),
    opacity: opts.style.opacity,
    rotation: parseAngle(opts.style.rotate),
    locked: opts.locked,
    name: opts.name,
  });
}
