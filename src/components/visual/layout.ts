/**
 * Pure layout helpers for visuals — the single source of truth for where each
 * node lands on the canvas. Both the static SVG renderer
 * (`visual-renderer.tsx`) and the interactive editor (`visual-editor.tsx`)
 * consume these so node hit-boxes always line up with what's drawn.
 *
 * All coordinates are in canvas space (the renderer's `viewBox`). A
 * {@link NodeBox} uses its CENTER (`x`/`y`) plus `width`/`height`, matching the
 * node-center convention used throughout the schema.
 */

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type Visual,
  type VisualKind,
  type VisualNode,
} from "@/lib/visual/schema";

export interface NodeBox {
  /** Center X in canvas coordinates. */
  x: number;
  /** Center Y in canvas coordinates. */
  y: number;
  width: number;
  height: number;
}

/** Visual kinds whose nodes are freely positioned via `node.x`/`node.y`. */
const POSITIONED_KINDS = new Set<VisualKind>([
  "flowchart",
  "mindmap",
  "concept",
]);

/** Whether a kind lays out nodes by explicit `x`/`y` (and thus supports drag). */
export function isPositionedKind(kind: VisualKind): boolean {
  return POSITIONED_KINDS.has(kind);
}

/** Box for a positioned node (flowchart/mindmap/concept). */
export function positionedBox(node: VisualNode): NodeBox {
  return {
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? DEFAULT_NODE_WIDTH,
    height: node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

export interface ChartBar {
  node: VisualNode;
  value: number;
  /** Bar column center X. */
  centerX: number;
  /** Bar left edge X. */
  barX: number;
  /** Bar top edge Y. */
  barY: number;
  barWidth: number;
  barHeight: number;
}

export interface ChartLayout {
  marginLeft: number;
  marginTop: number;
  plotWidth: number;
  plotHeight: number;
  baselineY: number;
  slot: number;
  barWidth: number;
  maxValue: number;
  bars: ChartBar[];
}

/** Bar-chart geometry. Mirrors `BarChart` in the renderer exactly. */
export function chartLayout(visual: Visual): ChartLayout {
  const marginLeft = 24;
  const marginRight = 24;
  const marginTop = 36;
  const marginBottom = 52;
  const plotWidth = visual.width - marginLeft - marginRight;
  const plotHeight = visual.height - marginTop - marginBottom;
  const baselineY = marginTop + plotHeight;
  const count = Math.max(visual.nodes.length, 1);
  const slot = plotWidth / count;
  const barWidth = Math.min(slot * 0.6, 72);
  const maxValue = Math.max(...visual.nodes.map((node) => node.value ?? 0), 1);

  const bars: ChartBar[] = visual.nodes.map((node, index) => {
    const value = node.value ?? 0;
    const barHeight = (value / maxValue) * (plotHeight - 16);
    const centerX = marginLeft + slot * index + slot / 2;
    return {
      node,
      value,
      centerX,
      barX: centerX - barWidth / 2,
      barY: baselineY - barHeight,
      barWidth,
      barHeight,
    };
  });

  return {
    marginLeft,
    marginTop,
    plotWidth,
    plotHeight,
    baselineY,
    slot,
    barWidth,
    maxValue,
    bars,
  };
}

export interface ListCard {
  node: VisualNode;
  /** Card top edge Y. */
  cardY: number;
  /** Card vertical center. */
  centerY: number;
}

export interface ListLayout {
  padX: number;
  top: number;
  cardHeight: number;
  gap: number;
  badge: number;
  cardWidth: number;
  badgeX: number;
  labelX: number;
  firstCenterY: number;
  lastCenterY: number;
  cards: ListCard[];
}

/** List/scene geometry. Mirrors `ListScene` in the renderer exactly. */
export function listLayout(visual: Visual): ListLayout {
  const padX = 36;
  const top = 28;
  const cardHeight = 64;
  const gap = 18;
  const badge = 18;
  const cardWidth = visual.width - padX * 2;
  const badgeX = padX + 28;
  const labelX = badgeX + badge + 18;
  const firstCenterY = top + cardHeight / 2;
  const lastCenterY =
    top + (visual.nodes.length - 1) * (cardHeight + gap) + cardHeight / 2;

  const cards: ListCard[] = visual.nodes.map((node, index) => {
    const cardY = top + index * (cardHeight + gap);
    return { node, cardY, centerY: cardY + cardHeight / 2 };
  });

  return {
    padX,
    top,
    cardHeight,
    gap,
    badge,
    cardWidth,
    badgeX,
    labelX,
    firstCenterY,
    lastCenterY,
    cards,
  };
}

export interface TimelineStep {
  node: VisualNode;
  index: number;
  /** Marker/badge center X on the axis. */
  centerX: number;
  /** Whether the label card sits above the axis. */
  above: boolean;
  /** Card left edge X. */
  cardX: number;
  /** Card top edge Y. */
  cardY: number;
  /** Card center X. */
  cardCenterX: number;
  /** Card center Y. */
  cardCenterY: number;
}

export interface TimelineLayout {
  marginX: number;
  /** Vertical position of the horizontal axis. */
  axisY: number;
  /** Horizontal space allotted to each step. */
  slot: number;
  badgeRadius: number;
  /** Gap between the axis badge and the label card. */
  stemLength: number;
  cardWidth: number;
  cardHeight: number;
  firstCenterX: number;
  lastCenterX: number;
  steps: TimelineStep[];
}

/**
 * Timeline geometry — ordered horizontal steps along a centered axis, with
 * label cards alternating above/below. Positions are derived from node order
 * (x/y are ignored), mirroring `Timeline` in the renderer exactly.
 */
export function timelineLayout(visual: Visual): TimelineLayout {
  const marginX = 40;
  const axisY = visual.height / 2;
  const count = Math.max(visual.nodes.length, 1);
  const slot = (visual.width - marginX * 2) / count;
  const badgeRadius = 15;
  const stemLength = 34;
  const cardWidth = Math.min(Math.max(slot - 20, 96), 200);
  const cardHeight = 60;

  const centerXFor = (index: number) => marginX + slot * index + slot / 2;

  const steps: TimelineStep[] = visual.nodes.map((node, index) => {
    const centerX = centerXFor(index);
    const above = index % 2 === 0;
    const cardCenterY = above
      ? axisY - badgeRadius - stemLength - cardHeight / 2
      : axisY + badgeRadius + stemLength + cardHeight / 2;
    return {
      node,
      index,
      centerX,
      above,
      cardX: centerX - cardWidth / 2,
      cardY: cardCenterY - cardHeight / 2,
      cardCenterX: centerX,
      cardCenterY,
    };
  });

  return {
    marginX,
    axisY,
    slot,
    badgeRadius,
    stemLength,
    cardWidth,
    cardHeight,
    firstCenterX: centerXFor(0),
    lastCenterX: centerXFor(Math.max(visual.nodes.length - 1, 0)),
    steps,
  };
}

export interface CycleNodePlacement {
  node: VisualNode;
  index: number;
  /** Center X. */
  x: number;
  /** Center Y. */
  y: number;
  width: number;
  height: number;
}

export interface CycleLayout {
  /** Ring center X. */
  cx: number;
  /** Ring center Y. */
  cy: number;
  radius: number;
  placements: CycleNodePlacement[];
}

/**
 * Cycle geometry — nodes evenly spaced around a ring (starting at the top,
 * going clockwise). Positions are derived from node order/count (x/y are
 * ignored), mirroring `CycleScene` in the renderer exactly.
 */
export function cycleLayout(visual: Visual): CycleLayout {
  const cx = visual.width / 2;
  const cy = visual.height / 2;
  const count = Math.max(visual.nodes.length, 1);

  // Reserve room for the node boxes so they never clip the canvas edge.
  const maxNodeWidth = Math.max(
    ...visual.nodes.map((node) => node.width ?? DEFAULT_NODE_WIDTH),
    DEFAULT_NODE_WIDTH,
  );
  const maxNodeHeight = Math.max(
    ...visual.nodes.map((node) => node.height ?? DEFAULT_NODE_HEIGHT),
    DEFAULT_NODE_HEIGHT,
  );
  const margin = 24;
  const radius = Math.max(
    Math.min(cx - maxNodeWidth / 2 - margin, cy - maxNodeHeight / 2 - margin),
    40,
  );

  const placements: CycleNodePlacement[] = visual.nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return {
      node,
      index,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
    };
  });

  return { cx, cy, radius, placements };
}

export interface ComparisonCell {
  node: VisualNode;
  /** Zero-based column index (left to right). */
  column: number;
  /** Whether this is the column's header (the first node in the column). */
  header: boolean;
  /** Card center X. */
  x: number;
  /** Card top edge Y. */
  cardY: number;
  /** Card center Y. */
  centerY: number;
  width: number;
  height: number;
}

export interface ComparisonColumn {
  /** Grouping key (rounded `node.value`, default 0). */
  key: number;
  /** Column center X. */
  centerX: number;
  cells: ComparisonCell[];
}

export interface ComparisonLayout {
  marginX: number;
  top: number;
  columnGap: number;
  columnWidth: number;
  headerHeight: number;
  itemHeight: number;
  cardGap: number;
  columns: ComparisonColumn[];
  /** All cells flattened, in node order. */
  cells: ComparisonCell[];
}

/**
 * Comparison geometry — N side-by-side columns of grouped item cards. Nodes are
 * grouped into columns by their rounded `node.value` (default 0), with columns
 * ordered by first appearance. The first node in each column is the column
 * header; the rest are stacked items. Mirrors `Comparison` in the renderer.
 */
export function comparisonLayout(visual: Visual): ComparisonLayout {
  const marginX = 28;
  const top = 28;
  const columnGap = 18;
  const cardGap = 12;
  const headerHeight = 54;
  const itemHeight = 46;

  const order: number[] = [];
  const groups = new Map<number, VisualNode[]>();
  for (const node of visual.nodes) {
    const key = Math.max(0, Math.round(node.value ?? 0));
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
      order.push(key);
    }
    bucket.push(node);
  }

  const columnCount = Math.max(order.length, 1);
  const totalGap = columnGap * (columnCount - 1);
  const columnWidth = (visual.width - marginX * 2 - totalGap) / columnCount;

  const cells: ComparisonCell[] = [];
  const columns: ComparisonColumn[] = order.map((key, columnIndex) => {
    const left = marginX + columnIndex * (columnWidth + columnGap);
    const centerX = left + columnWidth / 2;
    let y = top;
    const columnCells: ComparisonCell[] = (groups.get(key) ?? []).map(
      (node, rowIndex) => {
        const header = rowIndex === 0;
        const height = header ? headerHeight : itemHeight;
        const cell: ComparisonCell = {
          node,
          column: columnIndex,
          header,
          x: centerX,
          cardY: y,
          centerY: y + height / 2,
          width: columnWidth,
          height,
        };
        y += height + cardGap;
        return cell;
      },
    );
    cells.push(...columnCells);
    return { key, centerX, cells: columnCells };
  });

  return {
    marginX,
    top,
    columnGap,
    columnWidth,
    headerHeight,
    itemHeight,
    cardGap,
    columns,
    cells,
  };
}

export interface FunnelBand {
  node: VisualNode;
  index: number;
  value: number;
  /** Band center X (the canvas center). */
  cx: number;
  /** Band top edge Y. */
  bandY: number;
  /** Band center Y. */
  centerY: number;
  bandHeight: number;
  /** Width at the band's top edge. */
  topWidth: number;
  /** Width at the band's bottom edge. */
  bottomWidth: number;
}

export interface FunnelLayout {
  marginX: number;
  top: number;
  cx: number;
  bandHeight: number;
  bandGap: number;
  bands: FunnelBand[];
}

/**
 * Funnel geometry — bands stacked top-to-bottom in node order, each a trapezoid
 * whose width is driven by `node.value` (falling back to a decreasing sequence
 * by order). A running minimum of the width fraction keeps the funnel
 * monotonically narrowing even when the values aren't strictly decreasing.
 * Mirrors `Funnel` in the renderer exactly.
 */
export function funnelLayout(visual: Visual): FunnelLayout {
  const marginX = 44;
  const top = 28;
  const bottom = 28;
  const bandGap = 8;
  const minFrac = 0.16;
  const cx = visual.width / 2;
  const count = Math.max(visual.nodes.length, 1);
  const plotWidth = visual.width - marginX * 2;
  const plotHeight = visual.height - top - bottom;
  const bandHeight = (plotHeight - bandGap * (count - 1)) / count;

  const values = visual.nodes.map((node, index) => node.value ?? count - index);
  const maxValue = Math.max(...values, 1);
  const effFrac: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const raw = Math.min(Math.max(values[i] / maxValue, minFrac), 1);
    effFrac[i] = i === 0 ? raw : Math.min(effFrac[i - 1], raw);
  }

  const bands: FunnelBand[] = visual.nodes.map((node, index) => {
    const topWidth = effFrac[index] * plotWidth;
    const nextFrac =
      index < values.length - 1 ? effFrac[index + 1] : effFrac[index] * 0.6;
    const bandY = top + index * (bandHeight + bandGap);
    return {
      node,
      index,
      value: values[index],
      cx,
      bandY,
      centerY: bandY + bandHeight / 2,
      bandHeight,
      topWidth,
      bottomWidth: nextFrac * plotWidth,
    };
  });

  return { marginX, top, cx, bandHeight, bandGap, bands };
}

/**
 * Hit-box per node id for the interactive editor's overlay. For positioned
 * kinds it's the node's shape box; for charts it's the full bar column; for
 * lists it's the card. Clicking anywhere in the box selects/edits that node.
 */
export function nodeBoxes(visual: Visual): Map<string, NodeBox> {
  const boxes = new Map<string, NodeBox>();

  if (isPositionedKind(visual.type)) {
    for (const node of visual.nodes) {
      boxes.set(node.id, positionedBox(node));
    }
    return boxes;
  }

  if (visual.type === "chart") {
    const layout = chartLayout(visual);
    const columnWidth = Math.max(layout.slot * 0.86, layout.barWidth);
    const boxTop = layout.marginTop;
    const boxBottom = layout.baselineY + 28;
    for (const bar of layout.bars) {
      boxes.set(bar.node.id, {
        x: bar.centerX,
        y: (boxTop + boxBottom) / 2,
        width: columnWidth,
        height: boxBottom - boxTop,
      });
    }
    return boxes;
  }

  if (visual.type === "timeline") {
    const layout = timelineLayout(visual);
    for (const step of layout.steps) {
      boxes.set(step.node.id, {
        x: step.cardCenterX,
        y: step.cardCenterY,
        width: layout.cardWidth,
        height: layout.cardHeight,
      });
    }
    return boxes;
  }

  if (visual.type === "cycle") {
    const layout = cycleLayout(visual);
    for (const placement of layout.placements) {
      boxes.set(placement.node.id, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      });
    }
    return boxes;
  }

  if (visual.type === "comparison") {
    const layout = comparisonLayout(visual);
    for (const cell of layout.cells) {
      boxes.set(cell.node.id, {
        x: cell.x,
        y: cell.centerY,
        width: cell.width,
        height: cell.height,
      });
    }
    return boxes;
  }

  if (visual.type === "funnel") {
    const layout = funnelLayout(visual);
    for (const band of layout.bands) {
      boxes.set(band.node.id, {
        x: band.cx,
        y: band.centerY,
        width: Math.max(band.topWidth, band.bottomWidth),
        height: band.bandHeight,
      });
    }
    return boxes;
  }

  // list / scene
  const layout = listLayout(visual);
  for (const card of layout.cards) {
    boxes.set(card.node.id, {
      x: visual.width / 2,
      y: card.centerY,
      width: layout.cardWidth,
      height: layout.cardHeight,
    });
  }
  return boxes;
}
