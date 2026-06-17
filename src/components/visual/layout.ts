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
