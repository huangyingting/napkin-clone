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

export interface Point {
  x: number;
  y: number;
}

/** A node's center point in canvas coordinates. */
export function nodeCenter(node: VisualNode): Point {
  return { x: node.x ?? 0, y: node.y ?? 0 };
}

/** A node's half-width / half-height (its bounding-box radii). */
export function nodeHalf(node: VisualNode): { hw: number; hh: number } {
  return {
    hw: (node.width ?? DEFAULT_NODE_WIDTH) / 2,
    hh: (node.height ?? DEFAULT_NODE_HEIGHT) / 2,
  };
}

/** Padding (canvas units) added on sides where node content overflows. */
const CONTENT_VIEWBOX_PAD = 12;

/**
 * The SVG `viewBox` that fully encloses a visual's content.
 *
 * For freely-positioned kinds (flowchart/mindmap/concept/venn/orgchart), AI- or
 * user-placed nodes can land past the authored `width`/`height`; the root `<svg>`
 * clips to its viewport, so such nodes would be cut off in the editor, the
 * share/embed view, and every export. This expands the viewBox to include any
 * overflow (only on the sides that overflow, so well-fitted visuals keep their
 * exact authored framing).
 *
 * Auto-laid-out kinds (chart, timeline, cycle, …) do not store node `x`/`y` —
 * their geometry comes from dedicated layout functions that stay within the
 * canvas — so they always return `0 0 width height` unchanged.
 *
 * Shared by the static renderer and the interactive editor overlay so their
 * coordinate systems always line up.
 */
export function contentViewBox(visual: Visual): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = 0;
  let minY = 0;
  let maxX = visual.width;
  let maxY = visual.height;

  if (isPositionedKind(visual.type)) {
    for (const node of visual.nodes) {
      const { x, y } = nodeCenter(node);
      const { hw, hh } = nodeHalf(node);
      minX = Math.min(minX, x - hw);
      minY = Math.min(minY, y - hh);
      maxX = Math.max(maxX, x + hw);
      maxY = Math.max(maxY, y + hh);
    }
    if (minX < 0) minX -= CONTENT_VIEWBOX_PAD;
    if (minY < 0) minY -= CONTENT_VIEWBOX_PAD;
    if (maxX > visual.width) maxX += CONTENT_VIEWBOX_PAD;
    if (maxY > visual.height) maxY += CONTENT_VIEWBOX_PAD;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Point where the line from `from` toward a target box (centered at `to`,
 * half-extent `hw`/`hh`) meets the target's bounding box — used to stop edges
 * at the node boundary. Shared by the renderer and the editor overlay so edge
 * hit-areas always line up with the drawn connectors.
 */
export function boundaryPoint(
  from: Point,
  to: Point,
  hw: number,
  hh: number,
): Point {
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

/** Visual kinds whose nodes are freely positioned via `node.x`/`node.y`. */
const POSITIONED_KINDS = new Set<VisualKind>([
  "flowchart",
  "mindmap",
  "concept",
  "venn",
  "orgchart",
]);

/** Whether a kind lays out nodes by explicit `x`/`y` (and thus supports drag). */
export function isPositionedKind(kind: VisualKind): boolean {
  return POSITIONED_KINDS.has(kind);
}

/** Box for a positioned node (flowchart/mindmap/concept). */
function positionedBox(node: VisualNode): NodeBox {
  return {
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? DEFAULT_NODE_WIDTH,
    height: node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

/** The four corner handles of a node box. */
export type ResizeHandle = "nw" | "ne" | "se" | "sw";

export interface ResizeNodeBoxArgs {
  /** The node box (center `x`/`y` + `width`/`height`) at drag start. */
  start: NodeBox;
  /** Which corner is being dragged. */
  handle: ResizeHandle;
  /** Pointer delta from drag start, in canvas units. */
  dx: number;
  dy: number;
  /** When true, preserve the start box's aspect ratio. */
  lockAspect: boolean;
  /** Minimum width / height in canvas units. */
  min: { w: number; h: number };
  /** Canvas bounds; the result is clamped inside `[0, width] × [0, height]`. */
  bounds: { width: number; height: number };
}

/**
 * Pure resize transform for a center-based {@link NodeBox}. Dragging a corner
 * handle pins the OPPOSITE corner, recomputes `width`/`height` from the moved
 * corner, and re-derives the center `x`/`y` so the pinned corner stays put.
 *
 * Rules (applied in order): optional aspect-ratio lock to the start box, a
 * minimum-size floor (clamp, never reject/flip), then a canvas-bounds ceiling so
 * the box never escapes `[0, bounds.width] × [0, bounds.height]`. DOM-free.
 */
export function resizeNodeBox({
  start,
  handle,
  dx,
  dy,
  lockAspect,
  min,
  bounds,
}: ResizeNodeBoxArgs): NodeBox {
  const left = start.x - start.width / 2;
  const right = start.x + start.width / 2;
  const top = start.y - start.height / 2;
  const bottom = start.y + start.height / 2;

  // The moving corner sits on the left/top for these handles; the opposite
  // (pinned) corner is therefore on the right/bottom.
  const growLeft = handle === "nw" || handle === "sw";
  const growUp = handle === "nw" || handle === "ne";
  const anchorX = growLeft ? right : left;
  const anchorY = growUp ? bottom : top;

  // Signed dimensions from the pinned corner to the dragged (moved) corner.
  let w = growLeft ? start.width - dx : start.width + dx;
  let h = growUp ? start.height - dy : start.height + dy;

  const aspect = start.width / start.height;

  if (lockAspect && aspect > 0) {
    // Honor whichever axis yields the larger box so the corner tracks naturally.
    const hFromW = w / aspect;
    if (hFromW >= h) {
      h = hFromW;
    } else {
      w = h * aspect;
    }
  }

  // Minimum-size floor.
  if (lockAspect && aspect > 0) {
    if (w < min.w) {
      w = min.w;
      h = w / aspect;
    }
    if (h < min.h) {
      h = min.h;
      w = h * aspect;
    }
  } else {
    w = Math.max(w, min.w);
    h = Math.max(h, min.h);
  }

  // Canvas-bounds ceiling: available room from the pinned corner outward.
  const maxW = growLeft ? anchorX : bounds.width - anchorX;
  const maxH = growUp ? anchorY : bounds.height - anchorY;
  if (lockAspect && aspect > 0) {
    let scale = 1;
    if (w > maxW && maxW > 0) scale = Math.min(scale, maxW / w);
    if (h > maxH && maxH > 0) scale = Math.min(scale, maxH / h);
    w *= scale;
    h *= scale;
  } else {
    if (maxW > 0) w = Math.min(w, maxW);
    if (maxH > 0) h = Math.min(h, maxH);
  }

  // Re-derive the center so the pinned corner stays fixed.
  const newLeft = growLeft ? anchorX - w : anchorX;
  const newTop = growUp ? anchorY - h : anchorY;
  return {
    x: newLeft + w / 2,
    y: newTop + h / 2,
    width: w,
    height: h,
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

export interface PyramidBand {
  node: VisualNode;
  index: number;
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

export interface PyramidLayout {
  marginX: number;
  top: number;
  cx: number;
  bandHeight: number;
  bandGap: number;
  bands: PyramidBand[];
}

/**
 * Pyramid geometry — bands stacked top-to-bottom in node order, each a
 * trapezoid whose width widens linearly from apex (first node) to base (last
 * node). Mirrors `Pyramid` in the renderer exactly.
 */
export function pyramidLayout(visual: Visual): PyramidLayout {
  const marginX = 44;
  const top = 28;
  const bottom = 28;
  const bandGap = 6;
  const minFrac = 0.12;
  const maxFrac = 0.96;
  const cx = visual.width / 2;
  const count = Math.max(visual.nodes.length, 1);
  const plotHeight = visual.height - top - bottom;
  const bandHeight = (plotHeight - bandGap * (count - 1)) / count;
  const plotWidth = visual.width - marginX * 2;

  const bands: PyramidBand[] = visual.nodes.map((node, index) => {
    const frac =
      count === 1
        ? maxFrac
        : minFrac + (maxFrac - minFrac) * (index / (count - 1));
    const nextFrac =
      count === 1
        ? maxFrac
        : index < count - 1
          ? minFrac + (maxFrac - minFrac) * ((index + 1) / (count - 1))
          : maxFrac;
    const bandY = top + index * (bandHeight + bandGap);
    return {
      node,
      index,
      cx,
      bandY,
      centerY: bandY + bandHeight / 2,
      bandHeight,
      topWidth: frac * plotWidth,
      bottomWidth: nextFrac * plotWidth,
    };
  });

  return { marginX, top, cx, bandHeight, bandGap, bands };
}

export interface MatrixQuadrant {
  /** 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right */
  quadrant: number;
  nodes: VisualNode[];
  /** Quadrant left edge X. */
  cellX: number;
  /** Quadrant top edge Y. */
  cellY: number;
  /** Quadrant center X. */
  centerX: number;
  /** Quadrant center Y. */
  centerY: number;
  cellWidth: number;
  cellHeight: number;
}

export interface MatrixLayout {
  margin: number;
  /** X coordinate of the vertical divider. */
  dividerX: number;
  /** Y coordinate of the horizontal divider. */
  dividerY: number;
  cellWidth: number;
  cellHeight: number;
  quadrants: MatrixQuadrant[];
}

/**
 * Matrix geometry — a 2×2 grid. Nodes are grouped by their rounded `node.value`
 * (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right; defaults to 0).
 * The first node in each occupied quadrant is the quadrant title. Mirrors
 * `MatrixScene` in the renderer exactly.
 */
export function matrixLayout(visual: Visual): MatrixLayout {
  const margin = 28;
  const gap = 12;
  const cellWidth = (visual.width - margin * 2 - gap) / 2;
  const cellHeight = (visual.height - margin * 2 - gap) / 2;
  const dividerX = margin + cellWidth + gap / 2;
  const dividerY = margin + cellHeight + gap / 2;

  const groups = new Map<number, VisualNode[]>([
    [0, []],
    [1, []],
    [2, []],
    [3, []],
  ]);
  for (const node of visual.nodes) {
    const q = Math.min(3, Math.max(0, Math.round(node.value ?? 0)));
    groups.get(q)!.push(node);
  }

  const cellOrigins: [number, number][] = [
    [margin, margin],
    [margin + cellWidth + gap, margin],
    [margin, margin + cellHeight + gap],
    [margin + cellWidth + gap, margin + cellHeight + gap],
  ];

  const quadrants: MatrixQuadrant[] = [0, 1, 2, 3].map((q) => {
    const [cellX, cellY] = cellOrigins[q];
    return {
      quadrant: q,
      nodes: groups.get(q)!,
      cellX,
      cellY,
      centerX: cellX + cellWidth / 2,
      centerY: cellY + cellHeight / 2,
      cellWidth,
      cellHeight,
    };
  });

  return { margin, dividerX, dividerY, cellWidth, cellHeight, quadrants };
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

  if (visual.type === "pyramid") {
    const layout = pyramidLayout(visual);
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

  if (visual.type === "matrix") {
    const layout = matrixLayout(visual);
    for (const quad of layout.quadrants) {
      for (const node of quad.nodes) {
        boxes.set(node.id, {
          x: quad.centerX,
          y: quad.centerY,
          width: quad.cellWidth,
          height: quad.cellHeight,
        });
      }
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

export interface EdgeSegment {
  /** Connector start point (at the source node boundary). */
  start: Point;
  /** Connector end point (at the target node boundary). */
  end: Point;
  /** Midpoint of the connector (where labels/controls anchor). */
  mid: Point;
}

/**
 * Endpoints (at the node boundaries) for each drawn connector, keyed by edge id.
 * Only positioned kinds (flowchart/mindmap/concept) draw `visual.edges`, so
 * other kinds yield an empty map. Mirrors `EdgeEl` in the renderer so the
 * editor overlay's edge hit-areas line up with the drawn connectors.
 */
export function edgeSegments(visual: Visual): Map<string, EdgeSegment> {
  const segments = new Map<string, EdgeSegment>();
  if (!isPositionedKind(visual.type)) {
    return segments;
  }
  const nodeById = new Map(visual.nodes.map((node) => [node.id, node]));
  for (const edge of visual.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      continue;
    }
    const fromCenter = nodeCenter(from);
    const toCenter = nodeCenter(to);
    const fromHalf = nodeHalf(from);
    const toHalf = nodeHalf(to);
    const start = boundaryPoint(toCenter, fromCenter, fromHalf.hw, fromHalf.hh);
    const end = boundaryPoint(fromCenter, toCenter, toHalf.hw, toHalf.hh);
    segments.set(edge.id, {
      start,
      end,
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    });
  }
  return segments;
}
