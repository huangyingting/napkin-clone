import type { JSX } from "react";
import type { LucideIcon } from "lucide-react";

import { resolveIconComponent } from "@/components/visual/icon-registry";
import {
  boundaryPoint,
  nodeCenter,
  nodeHalf,
  type Point,
} from "@/lib/visual/layout";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type ArrowStyle,
  type NodeShape,
  type TextAlign,
  type VisualEdge,
  type VisualNode,
  type VisualStyle,
} from "@/lib/visual/schema";

export function pick(palette: string[], index: number): string {
  return palette[((index % palette.length) + palette.length) % palette.length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Renders a catalog icon (resolved to its `lucide-react` component) as a nested,
 * scaled SVG centered at (`cx`, `cy`). The icon's own `viewBox` scales it to the
 * requested `size`, and `color` drives its stroke so it follows the node's
 * text/theme color. `aria-hidden` keeps it out of the accessibility tree (the
 * node's label already conveys meaning).
 */
export function IconGlyph({
  Icon,
  cx,
  cy,
  size,
  color,
}: {
  Icon: LucideIcon;
  cx: number;
  cy: number;
  size: number;
  color: string;
}): JSX.Element {
  return (
    <Icon
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      color={color}
      aria-hidden="true"
    />
  );
}

/** A small filled triangle (arrowhead) pointing from `from` toward `tip`. */
export function arrowHead(
  tip: Point,
  from: Point,
  color: string,
  size = 9,
  variant: ArrowStyle = "filled",
): JSX.Element {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const back = { x: tip.x - size * ux, y: tip.y - size * uy };
  const px = -uy;
  const py = ux;
  const half = size * 0.55;

  if (variant === "circle") {
    const r = size * 0.42;
    const cx = tip.x - r * ux;
    const cy = tip.y - r * uy;
    return <circle cx={cx} cy={cy} r={r} fill={color} />;
  }
  if (variant === "diamond") {
    const d = size * 0.9;
    const mid = { x: tip.x - (d / 2) * ux, y: tip.y - (d / 2) * uy };
    const points = [
      `${tip.x},${tip.y}`,
      `${mid.x + px * half * 0.7},${mid.y + py * half * 0.7}`,
      `${tip.x - d * ux},${tip.y - d * uy}`,
      `${mid.x - px * half * 0.7},${mid.y - py * half * 0.7}`,
    ].join(" ");
    return <polygon points={points} fill={color} />;
  }
  if (variant === "open") {
    const p1 = `${back.x + px * half},${back.y + py * half}`;
    const p2 = `${tip.x},${tip.y}`;
    const p3 = `${back.x - px * half},${back.y - py * half}`;
    return (
      <polyline
        points={`${p1} ${p2} ${p3}`}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  }
  // filled (default)
  const points = [
    `${tip.x},${tip.y}`,
    `${back.x + px * half},${back.y + py * half}`,
    `${back.x - px * half},${back.y - py * half}`,
  ].join(" ");
  return <polygon points={points} fill={color} />;
}

/** Greedy word-wrap into at most `maxLines` lines, eliding any overflow. */
export function wrapLabel(
  text: string,
  maxChars: number,
  maxLines = 3,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [text];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+$/, "")}…`;
    return kept;
  }
  return lines;
}

export function maxCharsForWidth(width: number, fontSize: number): number {
  return Math.max(6, Math.floor((width - 16) / (fontSize * 0.55)));
}

export function MultilineText({
  cx,
  cy,
  lines,
  color,
  style,
  fontSize,
  fontWeight = 600,
  anchor = "middle",
  textAlign,
  nodeLeft,
  nodeRight,
}: {
  cx: number;
  cy: number;
  lines: string[];
  color: string;
  style: VisualStyle;
  fontSize: number;
  fontWeight?: number;
  anchor?: "start" | "middle" | "end";
  /** When set, overrides `anchor` and `cx` based on alignment within the node. */
  textAlign?: TextAlign;
  /** Left edge of the node (for left-aligned text). */
  nodeLeft?: number;
  /** Right edge of the node (for right-aligned text). */
  nodeRight?: number;
}): JSX.Element {
  const PAD = 10;
  let resolvedAnchor = anchor;
  let resolvedX = cx;
  if (textAlign !== undefined) {
    if (textAlign === "left") {
      resolvedAnchor = "start";
      resolvedX = nodeLeft !== undefined ? nodeLeft + PAD : cx;
    } else if (textAlign === "right") {
      resolvedAnchor = "end";
      resolvedX = nodeRight !== undefined ? nodeRight - PAD : cx;
    } else {
      resolvedAnchor = "middle";
      resolvedX = cx;
    }
  }
  const lineHeight = fontSize * 1.2;
  const startDy = -((lines.length - 1) / 2) * lineHeight;
  return (
    <text
      x={resolvedX}
      y={cy}
      textAnchor={resolvedAnchor}
      dominantBaseline="central"
      fill={color}
      fontFamily={style.fontFamily}
      fontSize={fontSize}
      fontWeight={fontWeight}
    >
      {lines.map((line, index) => (
        <tspan
          key={index}
          x={resolvedX}
          dy={index === 0 ? startDy : lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Maps a LineStyle to an SVG stroke-dasharray value. */
function dashArray(
  lineStyle: import("@/lib/visual/schema").LineStyle | undefined,
): string | undefined {
  if (lineStyle === "dashed") return "8 4";
  if (lineStyle === "dotted") return "2 4";
  return undefined;
}

function ShapeEl({
  node,
  fill,
  stroke,
  strokeWidth,
  uid,
}: {
  node: VisualNode;
  fill: string;
  stroke: string;
  strokeWidth: number;
  uid: string;
}): JSX.Element {
  const { x, y } = nodeCenter(node);
  const w = node.width ?? DEFAULT_NODE_WIDTH;
  const h = node.height ?? DEFAULT_NODE_HEIGHT;
  const shape: NodeShape = node.shape ?? "rounded";
  const left = x - w / 2;
  const top = y - h / 2;
  const sw = node.borderWidth ?? strokeWidth;
  const strokeDasharray = dashArray(node.borderStyle);
  const fillId =
    node.fillStyle === "gradient" ? `${uid}-grad-${node.id}` : undefined;
  const resolvedFill = fillId ? `url(#${fillId})` : fill;
  const common = {
    fill: resolvedFill,
    stroke,
    strokeWidth: sw,
    ...(strokeDasharray ? { strokeDasharray } : {}),
  } as const;

  switch (shape) {
    case "rectangle":
      return <rect x={left} y={top} width={w} height={h} {...common} />;
    case "pill":
      return (
        <rect
          x={left}
          y={top}
          width={w}
          height={h}
          rx={h / 2}
          ry={h / 2}
          {...common}
        />
      );
    case "ellipse":
      return <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} {...common} />;
    case "diamond":
      return (
        <polygon
          points={`${x},${top} ${left + w},${y} ${x},${top + h} ${left},${y}`}
          {...common}
        />
      );
    case "hexagon": {
      const inset = Math.min(w * 0.2, h * 0.5);
      return (
        <polygon
          points={[
            `${left + inset},${top}`,
            `${left + w - inset},${top}`,
            `${left + w},${y}`,
            `${left + w - inset},${top + h}`,
            `${left + inset},${top + h}`,
            `${left},${y}`,
          ].join(" ")}
          {...common}
        />
      );
    }
    case "rounded":
    default:
      return (
        <rect
          x={left}
          y={top}
          width={w}
          height={h}
          rx={12}
          ry={12}
          {...common}
        />
      );
  }
}

export function NodeEl({
  node,
  fill,
  stroke,
  text,
  style,
  fontSize,
  fontWeight = 600,
  strokeWidth = 1.5,
  uid,
}: {
  node: VisualNode;
  fill: string;
  stroke: string;
  text: string;
  style: VisualStyle;
  fontSize: number;
  fontWeight?: number;
  strokeWidth?: number;
  uid: string;
}): JSX.Element {
  const { x, y } = nodeCenter(node);
  const w = node.width ?? DEFAULT_NODE_WIDTH;
  const h = node.height ?? DEFAULT_NODE_HEIGHT;
  const lines = wrapLabel(node.label, maxCharsForWidth(w, fontSize));
  const Icon = node.icon ? resolveIconComponent(node.icon) : undefined;

  // When an icon is present, stack it above the label and keep the whole block
  // vertically centered; without one, the label centers exactly as before.
  const lineHeight = fontSize * 1.2;
  const textHeight = lines.length * lineHeight;
  const iconSize = Icon ? clamp(Math.min(h * 0.4, fontSize * 1.6), 14, 30) : 0;
  const iconGap = Icon ? Math.max(2, fontSize * 0.2) : 0;
  const blockTop = y - (iconSize + iconGap + textHeight) / 2;
  const textCy = Icon ? blockTop + iconSize + iconGap + textHeight / 2 : y;

  return (
    <g>
      <ShapeEl
        node={node}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        uid={uid}
      />
      {Icon ? (
        <IconGlyph
          Icon={Icon}
          cx={x}
          cy={blockTop + iconSize / 2}
          size={iconSize}
          color={text}
        />
      ) : null}
      <MultilineText
        cx={x}
        cy={textCy}
        lines={lines}
        color={text}
        style={
          node.fontFamily ? { ...style, fontFamily: node.fontFamily } : style
        }
        fontSize={fontSize}
        fontWeight={fontWeight}
        textAlign={node.textAlign}
        nodeLeft={x - w / 2}
        nodeRight={x + w / 2}
      />
    </g>
  );
}

function EdgeLabel({
  x,
  y,
  text,
  style,
}: {
  x: number;
  y: number;
  text: string;
  style: VisualStyle;
}): JSX.Element {
  const fontSize = Math.max(10, style.fontSize - 2);
  const w = text.length * fontSize * 0.6 + 12;
  const h = fontSize + 8;
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={6}
        fill={style.background}
        stroke={style.edgeColor}
        strokeWidth={1}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={style.nodeText}
        fontFamily={style.fontFamily}
        fontSize={fontSize}
        fontWeight={500}
      >
        {text}
      </text>
    </g>
  );
}

export function EdgeEl({
  edge,
  nodes,
  style,
  color,
  width = 1.6,
  arrow = true,
  curved = false,
}: {
  edge: VisualEdge;
  nodes: Map<string, VisualNode>;
  style: VisualStyle;
  color?: string;
  width?: number;
  arrow?: boolean;
  curved?: boolean;
}): JSX.Element | null {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) {
    return null;
  }

  const fromCenter = nodeCenter(from);
  const toCenter = nodeCenter(to);
  const fromHalf = nodeHalf(from);
  const toHalf = nodeHalf(to);
  const start = boundaryPoint(toCenter, fromCenter, fromHalf.hw, fromHalf.hh);
  const end = boundaryPoint(fromCenter, toCenter, toHalf.hw, toHalf.hh);
  const stroke = color ?? style.edgeColor;
  const showArrow = arrow && edge.directed !== false;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  // A per-edge `style` (US-017) overrides the renderer-kind default `curved`.
  const isCurved = edge.style !== undefined ? edge.style === "curved" : curved;
  const strokeWidth = edge.lineWidth ?? width;
  const strokeDasharray = dashArray(edge.lineStyle);
  const arrowVariant = edge.arrowStyle ?? "filled";

  return (
    <g>
      {isCurved ? (
        <path
          d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          {...(strokeDasharray ? { strokeDasharray } : {})}
        />
      ) : (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          {...(strokeDasharray ? { strokeDasharray } : {})}
        />
      )}
      {showArrow
        ? arrowHead(
            end,
            isCurved ? { x: midX, y: end.y } : start,
            stroke,
            9,
            arrowVariant,
          )
        : null}
      {edge.label ? (
        <EdgeLabel x={midX} y={midY} text={edge.label} style={style} />
      ) : null}
    </g>
  );
}

export function buildNodeMap(nodes: VisualNode[]): Map<string, VisualNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}
