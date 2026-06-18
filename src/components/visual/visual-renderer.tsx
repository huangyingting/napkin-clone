import { forwardRef, Fragment, type JSX } from "react";
import type { LucideIcon } from "lucide-react";

import { resolveIconComponent } from "@/components/visual/icon-registry";
import {
  chartLayout,
  comparisonLayout,
  cycleLayout,
  funnelLayout,
  listLayout,
  timelineLayout,
  type CycleNodePlacement,
} from "@/components/visual/layout";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type NodeShape,
  type Visual,
  type VisualEdge,
  type VisualNode,
  type VisualStyle,
} from "@/lib/visual/schema";

/**
 * SVG renderer that draws a {@link Visual} from the schema. It is intentionally
 * directive-free (no hooks / no `"use client"`) so it can render in server
 * components (gallery, read-only share pages) and client components (editor)
 * alike. Output is deterministic — arrowheads are drawn as explicit polygons
 * rather than `<marker>`s so there are no id collisions or hydration concerns.
 */

interface Point {
  x: number;
  y: number;
}

function nodeCenter(node: VisualNode): Point {
  return { x: node.x ?? 0, y: node.y ?? 0 };
}

function nodeHalf(node: VisualNode): { hw: number; hh: number } {
  return {
    hw: (node.width ?? DEFAULT_NODE_WIDTH) / 2,
    hh: (node.height ?? DEFAULT_NODE_HEIGHT) / 2,
  };
}

function pick(palette: string[], index: number): string {
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
function IconGlyph({
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

/** Point where the line from `from` to a target (centered at `to`) meets the
 * target's bounding box — used to stop edges at the node boundary. */
function boundaryPoint(from: Point, to: Point, hw: number, hh: number): Point {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (dx === 0 && dy === 0) {
    return { x: to.x, y: to.y };
  }
  const adx = Math.max(Math.abs(dx), 1e-6);
  const ady = Math.max(Math.abs(dy), 1e-6);
  const scale = Math.min(hw / adx, hh / ady);
  return { x: to.x + dx * scale, y: to.y + dy * scale };
}

function arrowHead(
  tip: Point,
  from: Point,
  color: string,
  size = 9,
): JSX.Element {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const back = { x: tip.x - size * ux, y: tip.y - size * uy };
  const px = -uy;
  const py = ux;
  const half = size * 0.55;
  const points = [
    `${tip.x},${tip.y}`,
    `${back.x + px * half},${back.y + py * half}`,
    `${back.x - px * half},${back.y - py * half}`,
  ].join(" ");
  return <polygon points={points} fill={color} />;
}

/** Greedy word-wrap into at most `maxLines` lines, eliding any overflow. */
function wrapLabel(text: string, maxChars: number, maxLines = 3): string[] {
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

function maxCharsForWidth(width: number, fontSize: number): number {
  return Math.max(6, Math.floor((width - 16) / (fontSize * 0.55)));
}

function MultilineText({
  cx,
  cy,
  lines,
  color,
  style,
  fontSize,
  fontWeight = 600,
  anchor = "middle",
}: {
  cx: number;
  cy: number;
  lines: string[];
  color: string;
  style: VisualStyle;
  fontSize: number;
  fontWeight?: number;
  anchor?: "start" | "middle" | "end";
}): JSX.Element {
  const lineHeight = fontSize * 1.2;
  const startDy = -((lines.length - 1) / 2) * lineHeight;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor={anchor}
      dominantBaseline="central"
      fill={color}
      fontFamily={style.fontFamily}
      fontSize={fontSize}
      fontWeight={fontWeight}
    >
      {lines.map((line, index) => (
        <tspan key={index} x={cx} dy={index === 0 ? startDy : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ShapeEl({
  node,
  fill,
  stroke,
  strokeWidth,
}: {
  node: VisualNode;
  fill: string;
  stroke: string;
  strokeWidth: number;
}): JSX.Element {
  const { x, y } = nodeCenter(node);
  const w = node.width ?? DEFAULT_NODE_WIDTH;
  const h = node.height ?? DEFAULT_NODE_HEIGHT;
  const shape: NodeShape = node.shape ?? "rounded";
  const left = x - w / 2;
  const top = y - h / 2;
  const common = { fill, stroke, strokeWidth } as const;

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

function NodeEl({
  node,
  fill,
  stroke,
  text,
  style,
  fontSize,
  fontWeight = 600,
  strokeWidth = 1.5,
}: {
  node: VisualNode;
  fill: string;
  stroke: string;
  text: string;
  style: VisualStyle;
  fontSize: number;
  fontWeight?: number;
  strokeWidth?: number;
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
        style={style}
        fontSize={fontSize}
        fontWeight={fontWeight}
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

function EdgeEl({
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

  return (
    <g>
      {curved ? (
        <path
          d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
        />
      )}
      {showArrow
        ? arrowHead(end, curved ? { x: midX, y: end.y } : start, stroke)
        : null}
      {edge.label ? (
        <EdgeLabel x={midX} y={midY} text={edge.label} style={style} />
      ) : null}
    </g>
  );
}

function buildNodeMap(nodes: VisualNode[]): Map<string, VisualNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function Flowchart({ visual }: { visual: Visual }): JSX.Element {
  const nodes = buildNodeMap(visual.nodes);
  const { style } = visual;
  return (
    <Fragment>
      {visual.edges.map((edge) => (
        <EdgeEl key={edge.id} edge={edge} nodes={nodes} style={style} />
      ))}
      {visual.nodes.map((node) => (
        <NodeEl
          key={node.id}
          node={node}
          fill={node.color ?? style.nodeFill}
          stroke={node.stroke ?? style.nodeStroke}
          text={node.textColor ?? style.nodeText}
          style={style}
          fontSize={style.fontSize}
          fontWeight={style.fontWeight}
        />
      ))}
    </Fragment>
  );
}

function MindMap({ visual }: { visual: Visual }): JSX.Element {
  const nodes = buildNodeMap(visual.nodes);
  const { style } = visual;
  const indexOf = new Map(visual.nodes.map((node, index) => [node.id, index]));
  return (
    <Fragment>
      {visual.edges.map((edge) => (
        <EdgeEl
          key={edge.id}
          edge={edge}
          nodes={nodes}
          style={style}
          curved
          arrow={false}
          width={2.5}
          color={pick(style.palette, indexOf.get(edge.to) ?? 0)}
        />
      ))}
      {visual.nodes.map((node, index) => {
        const color = node.color ?? pick(style.palette, index);
        const isRoot = index === 0;
        return (
          <NodeEl
            key={node.id}
            node={{ ...node, shape: node.shape ?? "pill" }}
            fill={color}
            stroke={node.stroke ?? color}
            text={node.textColor ?? "#ffffff"}
            style={style}
            fontSize={isRoot ? style.fontSize + 2 : style.fontSize}
            fontWeight={
              isRoot ? Math.min(style.fontWeight + 100, 900) : style.fontWeight
            }
            strokeWidth={0}
          />
        );
      })}
    </Fragment>
  );
}

function ListScene({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = listLayout(visual);
  const { padX, cardWidth, cardHeight, badge, badgeX, labelX } = layout;

  return (
    <Fragment>
      {visual.nodes.length > 1 ? (
        <line
          x1={badgeX}
          y1={layout.firstCenterY}
          x2={badgeX}
          y2={layout.lastCenterY}
          stroke={style.edgeColor}
          strokeWidth={2}
        />
      ) : null}
      {layout.cards.map((card, index) => {
        const accent = card.node.color ?? pick(style.palette, index);
        const Icon = card.node.icon
          ? resolveIconComponent(card.node.icon)
          : undefined;
        const iconSize = Icon ? 24 : 0;
        const iconGap = Icon ? 12 : 0;
        const textX = labelX + iconSize + iconGap;
        const lines = wrapLabel(
          card.node.label,
          maxCharsForWidth(cardWidth - (textX - padX), style.fontSize),
          2,
        );
        return (
          <g key={card.node.id}>
            <rect
              x={padX}
              y={card.cardY}
              width={cardWidth}
              height={cardHeight}
              rx={14}
              fill={style.nodeFill}
              stroke={card.node.stroke ?? style.nodeStroke}
              strokeWidth={1}
            />
            <circle cx={badgeX} cy={card.centerY} r={badge} fill={accent} />
            <text
              x={badgeX}
              y={card.centerY}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontFamily={style.fontFamily}
              fontSize={style.fontSize}
              fontWeight={700}
            >
              {index + 1}
            </text>
            {Icon ? (
              <IconGlyph
                Icon={Icon}
                cx={labelX + iconSize / 2}
                cy={card.centerY}
                size={iconSize}
                color={card.node.textColor ?? accent}
              />
            ) : null}
            <MultilineText
              cx={textX}
              cy={card.centerY}
              lines={lines}
              color={card.node.textColor ?? style.nodeText}
              style={style}
              fontSize={style.fontSize}
              fontWeight={style.fontWeight}
              anchor="start"
            />
          </g>
        );
      })}
    </Fragment>
  );
}

function BarChart({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = chartLayout(visual);
  const { marginLeft, plotWidth, baselineY } = layout;
  const labelFont = Math.max(10, style.fontSize - 1);

  return (
    <Fragment>
      <line
        x1={marginLeft}
        y1={baselineY}
        x2={marginLeft + plotWidth}
        y2={baselineY}
        stroke={style.edgeColor}
        strokeWidth={1.5}
      />
      {layout.bars.map((bar, index) => {
        const color = bar.node.color ?? pick(style.palette, index);
        const textColor = bar.node.textColor ?? style.nodeText;
        const Icon = bar.node.icon
          ? resolveIconComponent(bar.node.icon)
          : undefined;
        return (
          <g key={bar.node.id}>
            <rect
              x={bar.barX}
              y={bar.barY}
              width={bar.barWidth}
              height={Math.max(bar.barHeight, 0)}
              rx={6}
              fill={color}
            />
            <text
              x={bar.centerX}
              y={bar.barY - 8}
              textAnchor="middle"
              fill={textColor}
              fontFamily={style.fontFamily}
              fontSize={labelFont}
              fontWeight={Math.min(style.fontWeight + 100, 900)}
            >
              {bar.value}
            </text>
            <text
              x={bar.centerX}
              y={baselineY + 20}
              textAnchor="middle"
              fill={textColor}
              fontFamily={style.fontFamily}
              fontSize={labelFont}
              fontWeight={style.fontWeight}
            >
              {bar.node.label}
            </text>
            {Icon ? (
              <IconGlyph
                Icon={Icon}
                cx={bar.centerX}
                cy={baselineY + 38}
                size={18}
                color={textColor}
              />
            ) : null}
          </g>
        );
      })}
    </Fragment>
  );
}

function ConceptMap({ visual }: { visual: Visual }): JSX.Element {
  const nodes = buildNodeMap(visual.nodes);
  const { style } = visual;
  return (
    <Fragment>
      {visual.edges.map((edge) => (
        <EdgeEl
          key={edge.id}
          edge={edge}
          nodes={nodes}
          style={style}
          width={1.5}
        />
      ))}
      {visual.nodes.map((node, index) => {
        const accent = node.color ?? pick(style.palette, index);
        return (
          <NodeEl
            key={node.id}
            node={{ ...node, shape: node.shape ?? "ellipse" }}
            fill={style.nodeFill}
            stroke={node.stroke ?? accent}
            text={node.textColor ?? style.nodeText}
            style={style}
            fontSize={style.fontSize}
            fontWeight={style.fontWeight}
            strokeWidth={2.5}
          />
        );
      })}
    </Fragment>
  );
}

function Timeline({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = timelineLayout(visual);
  const { axisY, badgeRadius, cardHeight } = layout;

  return (
    <Fragment>
      {visual.nodes.length > 1 ? (
        <line
          x1={layout.firstCenterX}
          y1={axisY}
          x2={layout.lastCenterX}
          y2={axisY}
          stroke={style.edgeColor}
          strokeWidth={2}
        />
      ) : null}
      {layout.steps.map((step, index) => {
        const accent = step.node.color ?? pick(style.palette, index);
        const cardEdgeY = step.above ? step.cardY + cardHeight : step.cardY;
        return (
          <g key={step.node.id}>
            <line
              x1={step.centerX}
              y1={axisY}
              x2={step.centerX}
              y2={cardEdgeY}
              stroke={style.edgeColor}
              strokeWidth={1.5}
            />
            <NodeEl
              node={{
                ...step.node,
                x: step.cardCenterX,
                y: step.cardCenterY,
                width: layout.cardWidth,
                height: cardHeight,
                shape: "rounded",
              }}
              fill={style.nodeFill}
              stroke={step.node.stroke ?? style.nodeStroke}
              text={step.node.textColor ?? style.nodeText}
              style={style}
              fontSize={style.fontSize}
              fontWeight={style.fontWeight}
            />
            <circle
              cx={step.centerX}
              cy={axisY}
              r={badgeRadius}
              fill={accent}
            />
            <text
              x={step.centerX}
              y={axisY}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontFamily={style.fontFamily}
              fontSize={style.fontSize}
              fontWeight={700}
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </Fragment>
  );
}

/**
 * Directed arrow arcing along the ring from one node to the next. The control
 * point bulges outward from the ring center so consecutive arrows follow the
 * circle instead of cutting straight across it.
 */
function RingArrow({
  from,
  to,
  cx,
  cy,
  color,
}: {
  from: CycleNodePlacement;
  to: CycleNodePlacement;
  cx: number;
  cy: number;
  color: string;
}): JSX.Element {
  const fromCenter = { x: from.x, y: from.y };
  const toCenter = { x: to.x, y: to.y };
  const start = boundaryPoint(
    toCenter,
    fromCenter,
    from.width / 2,
    from.height / 2,
  );
  const end = boundaryPoint(fromCenter, toCenter, to.width / 2, to.height / 2);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  let ox = mid.x - cx;
  let oy = mid.y - cy;
  let len = Math.hypot(ox, oy);
  if (len < 1e-3) {
    ox = -(end.y - start.y);
    oy = end.x - start.x;
    len = Math.hypot(ox, oy) || 1;
  }
  const bulge = 28;
  const control = {
    x: mid.x + (ox / len) * bulge,
    y: mid.y + (oy / len) * bulge,
  };

  return (
    <g>
      <path
        d={`M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {arrowHead(end, control, color)}
    </g>
  );
}

function CycleScene({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = cycleLayout(visual);
  const { cx, cy, placements } = layout;
  const count = placements.length;

  return (
    <Fragment>
      {count > 1
        ? placements.map((from, index) => {
            const to = placements[(index + 1) % count];
            if (from === to) {
              return null;
            }
            return (
              <RingArrow
                key={`ring-${from.node.id}`}
                from={from}
                to={to}
                cx={cx}
                cy={cy}
                color={pick(style.palette, index)}
              />
            );
          })
        : null}
      {placements.map((placement, index) => {
        const accent = placement.node.color ?? pick(style.palette, index);
        return (
          <NodeEl
            key={placement.node.id}
            node={{
              ...placement.node,
              x: placement.x,
              y: placement.y,
              width: placement.width,
              height: placement.height,
              shape: placement.node.shape ?? "pill",
            }}
            fill={accent}
            stroke={placement.node.stroke ?? accent}
            text={placement.node.textColor ?? "#ffffff"}
            style={style}
            fontSize={style.fontSize}
            fontWeight={style.fontWeight}
            strokeWidth={0}
          />
        );
      })}
    </Fragment>
  );
}

function Comparison({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = comparisonLayout(visual);

  return (
    <Fragment>
      {layout.cells.map((cell) => {
        const paletteColor = pick(style.palette, cell.column);
        const node = {
          ...cell.node,
          x: cell.x,
          y: cell.centerY,
          width: cell.width,
          height: cell.height,
          shape: "rounded" as const,
        };
        if (cell.header) {
          return (
            <NodeEl
              key={cell.node.id}
              node={node}
              fill={cell.node.color ?? paletteColor}
              stroke={cell.node.stroke ?? cell.node.color ?? paletteColor}
              text={cell.node.textColor ?? "#ffffff"}
              style={style}
              fontSize={style.fontSize + 1}
              fontWeight={Math.min(style.fontWeight + 100, 900)}
              strokeWidth={0}
            />
          );
        }
        return (
          <NodeEl
            key={cell.node.id}
            node={node}
            fill={cell.node.color ?? style.nodeFill}
            stroke={cell.node.stroke ?? paletteColor}
            text={cell.node.textColor ?? style.nodeText}
            style={style}
            fontSize={style.fontSize}
            fontWeight={style.fontWeight}
            strokeWidth={1.5}
          />
        );
      })}
    </Fragment>
  );
}

function Funnel({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = funnelLayout(visual);

  return (
    <Fragment>
      {layout.bands.map((band, index) => {
        const accent = band.node.color ?? pick(style.palette, index);
        const text = band.node.textColor ?? "#ffffff";
        const { cx, bandY, bandHeight, topWidth, bottomWidth } = band;
        const points = [
          `${cx - topWidth / 2},${bandY}`,
          `${cx + topWidth / 2},${bandY}`,
          `${cx + bottomWidth / 2},${bandY + bandHeight}`,
          `${cx - bottomWidth / 2},${bandY + bandHeight}`,
        ].join(" ");
        const innerWidth = Math.max(Math.min(topWidth, bottomWidth), 48);
        const labelLines = wrapLabel(
          band.node.label,
          maxCharsForWidth(innerWidth, style.fontSize),
          2,
        );
        const lines =
          band.node.value !== undefined
            ? [...labelLines, String(band.node.value)]
            : labelLines;
        return (
          <g key={band.node.id}>
            <polygon points={points} fill={accent} />
            <MultilineText
              cx={cx}
              cy={band.centerY}
              lines={lines}
              color={text}
              style={style}
              fontSize={style.fontSize}
              fontWeight={style.fontWeight}
            />
          </g>
        );
      })}
    </Fragment>
  );
}

function VisualBody({ visual }: { visual: Visual }): JSX.Element | null {
  switch (visual.type) {
    case "flowchart":
      return <Flowchart visual={visual} />;
    case "mindmap":
      return <MindMap visual={visual} />;
    case "list":
      return <ListScene visual={visual} />;
    case "chart":
      return <BarChart visual={visual} />;
    case "concept":
      return <ConceptMap visual={visual} />;
    case "timeline":
      return <Timeline visual={visual} />;
    case "cycle":
      return <CycleScene visual={visual} />;
    case "comparison":
      return <Comparison visual={visual} />;
    case "funnel":
      return <Funnel visual={visual} />;
    default:
      return null;
  }
}

export const VisualRenderer = forwardRef<
  SVGSVGElement,
  {
    visual: Visual;
    className?: string;
    title?: string;
  }
>(function VisualRenderer({ visual, className, title }, ref) {
  const label = title ?? visual.title ?? `${visual.type} visual`;
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${visual.width} ${visual.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={label}
    >
      <rect
        x={0}
        y={0}
        width={visual.width}
        height={visual.height}
        fill={visual.style.background}
      />
      <VisualBody visual={visual} />
    </svg>
  );
});
