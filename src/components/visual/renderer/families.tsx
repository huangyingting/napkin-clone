import { Fragment, type JSX } from "react";

import {
  boundaryPoint,
  chartLayout,
  comparisonLayout,
  cycleLayout,
  funnelLayout,
  listLayout,
  matrixLayout,
  pyramidLayout,
  timelineLayout,
  type CycleNodePlacement,
} from "@/lib/visual/layout";
import type { Visual } from "@/lib/visual/schema";
import {
  EdgeEl,
  IconGlyph,
  MultilineText,
  NodeEl,
  arrowHead,
  buildNodeMap,
  maxCharsForWidth,
  pick,
  wrapLabel,
} from "./primitives";
import { resolveIconComponent } from "@/components/visual/icon-registry";

function Flowchart({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
          uid={uid}
        />
      ))}
    </Fragment>
  );
}

function MindMap({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
            uid={uid}
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

function ConceptMap({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
            uid={uid}
          />
        );
      })}
    </Fragment>
  );
}

function Timeline({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
              uid={uid}
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

function CycleScene({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
            uid={uid}
          />
        );
      })}
    </Fragment>
  );
}

function Comparison({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
              uid={uid}
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
            uid={uid}
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

function VennDiagram({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  return (
    <Fragment>
      {visual.nodes.map((node, index) => {
        const accent = node.color ?? pick(style.palette, index);
        const cx = node.x ?? visual.width / 2;
        const cy = node.y ?? visual.height / 2;
        const r = (node.width ?? 200) / 2;
        const lines = wrapLabel(
          node.label,
          maxCharsForWidth(r * 1.2, style.fontSize),
          2,
        );
        return (
          <g key={node.id}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={accent}
              fillOpacity={0.35}
              stroke={node.stroke ?? accent}
              strokeWidth={2}
            />
            <MultilineText
              cx={cx}
              cy={cy - r * 0.45}
              lines={lines}
              color={node.textColor ?? style.nodeText}
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

function Pyramid({
  visual,
  transparentBackground,
}: {
  visual: Visual;
  transparentBackground: boolean;
}): JSX.Element {
  const { style } = visual;
  const layout = pyramidLayout(visual);

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
        const lines = wrapLabel(
          band.node.label,
          maxCharsForWidth(innerWidth, style.fontSize),
          2,
        );
        return (
          <g key={band.node.id}>
            <polygon
              points={points}
              fill={accent}
              stroke={transparentBackground ? "none" : style.background}
              strokeWidth={transparentBackground ? 0 : 2}
            />
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

function MatrixScene({ visual }: { visual: Visual }): JSX.Element {
  const { style } = visual;
  const layout = matrixLayout(visual);

  return (
    <Fragment>
      {/* Background cell fills */}
      {layout.quadrants.map((quad) => {
        const accent = pick(style.palette, quad.quadrant);
        return (
          <rect
            key={`bg-${quad.quadrant}`}
            x={quad.cellX}
            y={quad.cellY}
            width={quad.cellWidth}
            height={quad.cellHeight}
            rx={10}
            fill={accent}
            fillOpacity={0.12}
            stroke={accent}
            strokeWidth={1.5}
          />
        );
      })}
      {/* Divider lines */}
      <line
        x1={layout.dividerX}
        y1={layout.margin}
        x2={layout.dividerX}
        y2={visual.height - layout.margin}
        stroke={style.edgeColor}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <line
        x1={layout.margin}
        y1={layout.dividerY}
        x2={visual.width - layout.margin}
        y2={layout.dividerY}
        stroke={style.edgeColor}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      {/* Quadrant content */}
      {layout.quadrants.map((quad) => {
        const accent = pick(style.palette, quad.quadrant);
        if (quad.nodes.length === 0) {
          return null;
        }
        // Stack nodes vertically within the cell
        const rowHeight = quad.cellHeight / Math.max(quad.nodes.length, 1);
        return quad.nodes.map((node, rowIndex) => {
          const nodeCx = quad.centerX;
          const nodeCy = quad.cellY + rowHeight * rowIndex + rowHeight / 2;
          const isFirst = rowIndex === 0;
          const lines = wrapLabel(
            node.label,
            maxCharsForWidth(quad.cellWidth - 24, style.fontSize),
            2,
          );
          return (
            <g key={node.id}>
              {isFirst ? (
                <MultilineText
                  cx={nodeCx}
                  cy={nodeCy}
                  lines={lines}
                  color={node.textColor ?? accent}
                  style={style}
                  fontSize={style.fontSize + 1}
                  fontWeight={Math.min(style.fontWeight + 100, 900)}
                />
              ) : (
                <MultilineText
                  cx={nodeCx}
                  cy={nodeCy}
                  lines={lines}
                  color={node.textColor ?? style.nodeText}
                  style={style}
                  fontSize={style.fontSize}
                  fontWeight={style.fontWeight}
                />
              )}
            </g>
          );
        });
      })}
    </Fragment>
  );
}

function OrgChart({
  visual,
  uid,
}: {
  visual: Visual;
  uid: string;
}): JSX.Element {
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
          arrow={false}
        />
      ))}
      {visual.nodes.map((node, index) => {
        const accent = node.color ?? pick(style.palette, index);
        return (
          <NodeEl
            key={node.id}
            node={{ ...node, shape: node.shape ?? "rounded" }}
            fill={style.nodeFill}
            stroke={node.stroke ?? accent}
            text={node.textColor ?? style.nodeText}
            style={style}
            fontSize={style.fontSize}
            fontWeight={style.fontWeight}
            strokeWidth={2}
            uid={uid}
          />
        );
      })}
    </Fragment>
  );
}

export function VisualBody({
  visual,
  transparentBackground,
  uid,
}: {
  visual: Visual;
  transparentBackground: boolean;
  uid: string;
}): JSX.Element | null {
  switch (visual.type) {
    case "flowchart":
      return <Flowchart visual={visual} uid={uid} />;
    case "mindmap":
      return <MindMap visual={visual} uid={uid} />;
    case "list":
      return <ListScene visual={visual} />;
    case "chart":
      return <BarChart visual={visual} />;
    case "concept":
      return <ConceptMap visual={visual} uid={uid} />;
    case "timeline":
      return <Timeline visual={visual} uid={uid} />;
    case "cycle":
      return <CycleScene visual={visual} uid={uid} />;
    case "comparison":
      return <Comparison visual={visual} uid={uid} />;
    case "funnel":
      return <Funnel visual={visual} />;
    case "venn":
      return <VennDiagram visual={visual} />;
    case "pyramid":
      return (
        <Pyramid
          visual={visual}
          transparentBackground={transparentBackground}
        />
      );
    case "matrix":
      return <MatrixScene visual={visual} />;
    case "orgchart":
      return <OrgChart visual={visual} uid={uid} />;
    default:
      return null;
  }
}
