/**
 * Pure, browser-free conversion of a {@link Visual} into an array of
 * {@link PptxSpec} descriptors — serializable objects that describe each
 * native PowerPoint shape, text box, or line to add to a slide.
 *
 * Supported natively (11 of 13 kinds):
 *   flowchart, mindmap, concept, orgchart, venn → positioned nodes + edges
 *   list, chart, timeline, cycle, comparison, matrix → layout-driven shapes
 *
 * Image fallback (2 of 13 kinds):
 *   funnel, pyramid → trapezoid bands that have no direct PptxGenJS equivalent
 *
 * When a kind requires a fallback the returned array is a single
 * `{ kind: "image-fallback" }` element.
 *
 * No PptxGenJS import here — callers translate descriptors to PptxGenJS calls
 * so this module stays testable under `node --test` without a browser.
 */

import {
  boundaryPoint,
  chartLayout,
  comparisonLayout,
  cycleLayout,
  listLayout,
  matrixLayout,
  timelineLayout,
  type Point,
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

// ---------------------------------------------------------------------------
// Descriptor types
// ---------------------------------------------------------------------------

/** A filled/stroked rectangle (optionally rounded corners). */
export type PptxRectSpec = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  /** 0–100 fill transparency percent (0 = fully opaque, 100 = fully clear). */
  fillTransparency?: number;
  stroke: string;
  strokeWidth: number;
  /** Corner radius in inches — omit for sharp corners. */
  cornerRadius?: number;
};

/** A filled/stroked ellipse. */
export type PptxEllipseSpec = {
  kind: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  fillTransparency?: number;
  stroke: string;
  strokeWidth: number;
};

/** A diamond shape (PptxGenJS ShapeType.diamond). */
export type PptxDiamondSpec = {
  kind: "diamond";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

/** A hexagon shape (PptxGenJS ShapeType.hexagon). */
export type PptxHexagonSpec = {
  kind: "hexagon";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

/** A straight line. For directed edges `arrowEnd` adds the arrowhead. */
export type PptxLineSpec = {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  arrowEnd?: boolean;
  dashed?: boolean;
};

/** A text box. */
export type PptxTextSpec = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Font size in points. */
  fontSize: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  fontFace?: string;
};

/**
 * Sentinel — the caller must rasterize the SVG and embed the image instead.
 * Returned when the visual kind cannot be reasonably represented as native
 * PowerPoint shapes (currently: funnel, pyramid).
 */
type PptxImageFallbackSpec = {
  kind: "image-fallback";
};

export type PptxSpec =
  | PptxRectSpec
  | PptxEllipseSpec
  | PptxDiamondSpec
  | PptxHexagonSpec
  | PptxLineSpec
  | PptxTextSpec
  | PptxImageFallbackSpec;

// ---------------------------------------------------------------------------
// Slide layout
// ---------------------------------------------------------------------------

/** Translates canvas coordinates to slide-inch coordinates. */
export interface PptxSlideLayout {
  /** Inch offset of the visual area from the left edge of the slide. */
  offsetX: number;
  /** Inch offset of the visual area from the top edge of the slide. */
  offsetY: number;
  /** Canvas units → inches conversion factor. */
  scale: number;
}

/**
 * Computes the layout to place the visual on a slide.
 *
 * The visual is scaled uniformly to fill at most `margin` fraction of the
 * available area (below the optional title strip) and centered.
 *
 * @param visual       The visual to lay out.
 * @param titleAreaH   Vertical inches already reserved for a slide title
 *                     (pass 0 for no title).
 * @param slideW       Slide width in inches (default 10).
 * @param slideH       Slide height in inches (default 7.5).
 * @param margin       Fraction of slide area used for the visual (default 0.85).
 */
export function computeVisualSlideLayout(
  visual: Visual,
  titleAreaH = 0,
  slideW = 10,
  slideH = 7.5,
  margin = 0.85,
): PptxSlideLayout {
  const availW = slideW * margin;
  const contentTopY = titleAreaH > 0 ? titleAreaH + 0.15 : 0;
  const availH = (slideH - contentTopY) * margin;
  const scale = Math.min(availW / visual.width, availH / visual.height);
  const usedW = visual.width * scale;
  const usedH = visual.height * scale;
  return {
    offsetX: (slideW - usedW) / 2,
    offsetY: contentTopY + (slideH - contentTopY - usedH) / 2,
    scale,
  };
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Strip leading '#' so PptxGenJS receives a bare hex string. */
export function toHex(color: string): string {
  if (color.startsWith("#")) return color.slice(1).toUpperCase();
  return color.toUpperCase();
}

/** Palette pick helper (cyclic). */
function pick(palette: string[], index: number): string {
  return palette[((index % palette.length) + palette.length) % palette.length];
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function ix(canvasX: number, layout: PptxSlideLayout): number {
  return layout.offsetX + canvasX * layout.scale;
}

function iy(canvasY: number, layout: PptxSlideLayout): number {
  return layout.offsetY + canvasY * layout.scale;
}

function iw(canvasW: number, layout: PptxSlideLayout): number {
  return canvasW * layout.scale;
}

/** Canvas px font-size → slide pt */
function ptSize(pxSize: number, layout: PptxSlideLayout): number {
  // 1 CSS px at 96 dpi = 1/96 inch; 1 pt = 1/72 inch → multiply by 72
  return Math.max(6, Math.round(pxSize * layout.scale * 72));
}

/** Extract a usable PPTX font face from a CSS font-family stack. */
function toFontFace(fontFamily: string): string {
  const first = fontFamily.split(",")[0].trim().replace(/['"]/g, "");
  if (!first || first === "ui-sans-serif" || first === "sans-serif")
    return "Calibri";
  if (first === "ui-monospace" || first === "monospace") return "Courier New";
  if (first === "ui-serif" || first === "serif") return "Georgia";
  return first;
}

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

/** Derive PPTX specs for a single node shape (rect/rounded/pill/ellipse/…). */
function nodeShapeSpec(
  node: VisualNode,
  fill: string,
  stroke: string,
  strokeWidth: number,
  layout: PptxSlideLayout,
  shapeOverride?: NodeShape,
): PptxSpec {
  const cx = node.x ?? 0;
  const cy = node.y ?? 0;
  const w = node.width ?? DEFAULT_NODE_WIDTH;
  const h = node.height ?? DEFAULT_NODE_HEIGHT;
  const shape: NodeShape = shapeOverride ?? node.shape ?? "rounded";

  const left = cx - w / 2;
  const top = cy - h / 2;
  const x = ix(left, layout);
  const y = iy(top, layout);
  const wi = iw(w, layout);
  const hi = iw(h, layout);

  const fillHex = toHex(fill);
  const strokeHex = toHex(stroke);

  switch (shape) {
    case "ellipse":
      return {
        kind: "ellipse",
        x,
        y,
        w: wi,
        h: hi,
        fill: fillHex,
        stroke: strokeHex,
        strokeWidth,
      };
    case "diamond":
      return {
        kind: "diamond",
        x,
        y,
        w: wi,
        h: hi,
        fill: fillHex,
        stroke: strokeHex,
        strokeWidth,
      };
    case "hexagon":
      return {
        kind: "hexagon",
        x,
        y,
        w: wi,
        h: hi,
        fill: fillHex,
        stroke: strokeHex,
        strokeWidth,
      };
    case "rectangle":
      return {
        kind: "rect",
        x,
        y,
        w: wi,
        h: hi,
        fill: fillHex,
        stroke: strokeHex,
        strokeWidth,
      };
    case "pill":
      return {
        kind: "rect",
        x,
        y,
        w: wi,
        h: hi,
        fill: fillHex,
        stroke: strokeHex,
        strokeWidth,
        cornerRadius: iw(h / 2, layout),
      };
    case "rounded":
    default:
      return {
        kind: "rect",
        x,
        y,
        w: wi,
        h: hi,
        fill: fillHex,
        stroke: strokeHex,
        strokeWidth,
        cornerRadius: iw(12, layout),
      };
  }
}

/** Text box centered on a canvas point, matching node dimensions. */
function nodeLabelSpec(
  node: VisualNode,
  textColor: string,
  style: VisualStyle,
  layout: PptxSlideLayout,
  fontSizeOverride?: number,
  fontWeightOverride?: number,
  alignOverride?: "left" | "center" | "right",
  wOverride?: number,
  hOverride?: number,
  cxOverride?: number,
  cyOverride?: number,
): PptxTextSpec {
  const cx = cxOverride ?? node.x ?? 0;
  const cy = cyOverride ?? node.y ?? 0;
  const w = wOverride ?? node.width ?? DEFAULT_NODE_WIDTH;
  const h = hOverride ?? node.height ?? DEFAULT_NODE_HEIGHT;
  const fontSize = fontSizeOverride ?? style.fontSize;
  const fontWeight = fontWeightOverride ?? style.fontWeight;

  return {
    kind: "text",
    text: node.label,
    x: ix(cx - w / 2, layout),
    y: iy(cy - h / 2, layout),
    w: iw(w, layout),
    h: iw(h, layout),
    color: toHex(textColor),
    fontSize: ptSize(fontSize, layout),
    bold: fontWeight >= 600,
    align: alignOverride ?? "center",
    fontFace: toFontFace(style.fontFamily),
  };
}

/** Line (and optional arrowhead) for an edge between two positioned nodes. */
function edgeLineSpec(
  edge: VisualEdge,
  nodeMap: Map<string, VisualNode>,
  color: string,
  strokeWidth: number,
  layout: PptxSlideLayout,
  showArrow = true,
): PptxLineSpec | null {
  const from = nodeMap.get(edge.from);
  const to = nodeMap.get(edge.to);
  if (!from || !to) return null;

  const fromCenter: Point = { x: from.x ?? 0, y: from.y ?? 0 };
  const toCenter: Point = { x: to.x ?? 0, y: to.y ?? 0 };
  const fromHalf = {
    hw: (from.width ?? DEFAULT_NODE_WIDTH) / 2,
    hh: (from.height ?? DEFAULT_NODE_HEIGHT) / 2,
  };
  const toHalf = {
    hw: (to.width ?? DEFAULT_NODE_WIDTH) / 2,
    hh: (to.height ?? DEFAULT_NODE_HEIGHT) / 2,
  };

  const start = boundaryPoint(toCenter, fromCenter, fromHalf.hw, fromHalf.hh);
  const end = boundaryPoint(fromCenter, toCenter, toHalf.hw, toHalf.hh);
  const directed = edge.directed !== false;

  return {
    kind: "line",
    x1: ix(start.x, layout),
    y1: iy(start.y, layout),
    x2: ix(end.x, layout),
    y2: iy(end.y, layout),
    color: toHex(color),
    strokeWidth,
    arrowEnd: showArrow && directed,
  };
}

// ---------------------------------------------------------------------------
// Per-kind spec generators
// ---------------------------------------------------------------------------

function specsForPositioned(
  visual: Visual,
  layout: PptxSlideLayout,
  opts: {
    defaultShape?: NodeShape;
    fillFn: (node: VisualNode, index: number) => string;
    strokeFn: (node: VisualNode, index: number) => string;
    textFn: (node: VisualNode, index: number) => string;
    strokeWidth?: number;
    edgeArrow?: boolean;
    edgeColorFn?: (edge: VisualEdge, index: number) => string;
    edgeWidth?: number;
    fontSizeFn?: (node: VisualNode, index: number) => number;
    fontWeightFn?: (node: VisualNode, index: number) => number;
  },
): PptxSpec[] {
  const nodeMap = new Map(visual.nodes.map((n) => [n.id, n]));
  const indexOf = new Map(visual.nodes.map((n, i) => [n.id, i]));
  const { style } = visual;
  const specs: PptxSpec[] = [];

  // Background fill for the visual
  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  // Edges first (render under nodes)
  for (let i = 0; i < visual.edges.length; i++) {
    const edge = visual.edges[i];
    const edgeColor = opts.edgeColorFn
      ? opts.edgeColorFn(edge, i)
      : toHex(style.edgeColor);
    const line = edgeLineSpec(
      edge,
      nodeMap,
      edgeColor,
      opts.edgeWidth ?? 1.6,
      layout,
      opts.edgeArrow,
    );
    if (line) specs.push(line);

    // Edge label
    if (edge.label) {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (from && to) {
        const midX = ((from.x ?? 0) + (to.x ?? 0)) / 2;
        const midY = ((from.y ?? 0) + (to.y ?? 0)) / 2;
        const lw = Math.max(edge.label.length * style.fontSize * 0.6 + 12, 48);
        const lh = style.fontSize + 8;
        specs.push({
          kind: "text",
          text: edge.label,
          x: ix(midX - lw / 2, layout),
          y: iy(midY - lh / 2, layout),
          w: iw(lw, layout),
          h: iw(lh, layout),
          color: toHex(style.nodeText),
          fontSize: ptSize(Math.max(10, style.fontSize - 2), layout),
          bold: false,
          align: "center",
          fontFace: toFontFace(style.fontFamily),
        });
      }
    }
  }

  // Nodes
  for (let i = 0; i < visual.nodes.length; i++) {
    const node = visual.nodes[i];
    const fill = opts.fillFn(node, i);
    const stroke = opts.strokeFn(node, i);
    const text = opts.textFn(node, i);
    const sw = opts.strokeWidth ?? 1.5;
    const fontSize = opts.fontSizeFn
      ? opts.fontSizeFn(node, i)
      : style.fontSize;
    const fontWeight = opts.fontWeightFn
      ? opts.fontWeightFn(node, i)
      : style.fontWeight;

    specs.push(
      nodeShapeSpec(node, fill, stroke, sw, layout, opts.defaultShape),
    );
    specs.push(nodeLabelSpec(node, text, style, layout, fontSize, fontWeight));
  }

  // Suppress unused-var warning when indexOf is only used below
  void indexOf;

  return specs;
}

function specsFlowchart(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  return specsForPositioned(visual, layout, {
    fillFn: (n) => n.color ?? style.nodeFill,
    strokeFn: (n) => n.stroke ?? style.nodeStroke,
    textFn: (n) => n.textColor ?? style.nodeText,
    strokeWidth: 1.5,
    edgeArrow: true,
    edgeWidth: 1.6,
  });
}

function specsMindMap(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const nodeIndexOf = new Map(visual.nodes.map((n, i) => [n.id, i]));
  return specsForPositioned(visual, layout, {
    defaultShape: "pill",
    fillFn: (n, i) => n.color ?? pick(style.palette, i),
    strokeFn: (n, i) => n.stroke ?? pick(style.palette, i),
    textFn: (n) => n.textColor ?? "#ffffff",
    strokeWidth: 0,
    edgeArrow: false,
    edgeWidth: 2.5,
    edgeColorFn: (e) => {
      const idx = nodeIndexOf.get(e.to) ?? 0;
      return pick(style.palette, idx);
    },
    fontSizeFn: (_, i) => (i === 0 ? style.fontSize + 2 : style.fontSize),
    fontWeightFn: (_, i) =>
      i === 0 ? Math.min(style.fontWeight + 100, 900) : style.fontWeight,
  });
}

function specsConceptMap(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  return specsForPositioned(visual, layout, {
    defaultShape: "ellipse",
    fillFn: () => style.nodeFill,
    strokeFn: (n, i) => n.stroke ?? pick(style.palette, i),
    textFn: (n) => n.textColor ?? style.nodeText,
    strokeWidth: 2.5,
    edgeArrow: true,
    edgeWidth: 1.5,
  });
}

function specsOrgChart(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  return specsForPositioned(visual, layout, {
    defaultShape: "rounded",
    fillFn: () => style.nodeFill,
    strokeFn: (n, i) => n.stroke ?? pick(style.palette, i),
    textFn: (n) => n.textColor ?? style.nodeText,
    strokeWidth: 2,
    edgeArrow: false,
    edgeWidth: 1.5,
  });
}

function specsVenn(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  for (let i = 0; i < visual.nodes.length; i++) {
    const node = visual.nodes[i];
    const accent = node.color ?? pick(style.palette, i);
    const cx = node.x ?? visual.width / 2;
    const cy = node.y ?? visual.height / 2;
    const r = (node.width ?? 200) / 2;

    specs.push({
      kind: "ellipse",
      x: ix(cx - r, layout),
      y: iy(cy - r, layout),
      w: iw(r * 2, layout),
      h: iw(r * 2, layout),
      fill: toHex(accent),
      fillTransparency: 65,
      stroke: toHex(node.stroke ?? accent),
      strokeWidth: 2,
    });

    const labelCy = cy - r * 0.45;
    specs.push({
      kind: "text",
      text: node.label,
      x: ix(cx - r * 0.8, layout),
      y: iy(labelCy - style.fontSize * 1.5, layout),
      w: iw(r * 1.6, layout),
      h: iw(style.fontSize * 3, layout),
      color: toHex(node.textColor ?? style.nodeText),
      fontSize: ptSize(style.fontSize, layout),
      bold: style.fontWeight >= 600,
      align: "center",
      fontFace: toFontFace(style.fontFamily),
    });
  }

  return specs;
}

function specsList(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const lo = listLayout(visual);
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  if (visual.nodes.length > 1) {
    specs.push({
      kind: "line",
      x1: ix(lo.badgeX, layout),
      y1: iy(lo.firstCenterY, layout),
      x2: ix(lo.badgeX, layout),
      y2: iy(lo.lastCenterY, layout),
      color: toHex(style.edgeColor),
      strokeWidth: 2,
    });
  }

  for (let i = 0; i < lo.cards.length; i++) {
    const card = lo.cards[i];
    const accent = card.node.color ?? pick(style.palette, i);

    // Card background
    specs.push({
      kind: "rect",
      x: ix(lo.padX, layout),
      y: iy(card.cardY, layout),
      w: iw(lo.cardWidth, layout),
      h: iw(lo.cardHeight, layout),
      fill: toHex(style.nodeFill),
      stroke: toHex(card.node.stroke ?? style.nodeStroke),
      strokeWidth: 1,
      cornerRadius: iw(14, layout),
    });

    // Badge circle
    specs.push({
      kind: "ellipse",
      x: ix(lo.badgeX - lo.badge, layout),
      y: iy(card.centerY - lo.badge, layout),
      w: iw(lo.badge * 2, layout),
      h: iw(lo.badge * 2, layout),
      fill: toHex(accent),
      stroke: toHex(accent),
      strokeWidth: 0,
    });

    // Badge number
    specs.push({
      kind: "text",
      text: String(i + 1),
      x: ix(lo.badgeX - lo.badge, layout),
      y: iy(card.centerY - lo.badge, layout),
      w: iw(lo.badge * 2, layout),
      h: iw(lo.badge * 2, layout),
      color: "FFFFFF",
      fontSize: ptSize(style.fontSize, layout),
      bold: true,
      align: "center",
      fontFace: toFontFace(style.fontFamily),
    });

    // Label
    specs.push({
      kind: "text",
      text: card.node.label,
      x: ix(lo.labelX, layout),
      y: iy(card.cardY, layout),
      w: iw(lo.cardWidth - (lo.labelX - lo.padX), layout),
      h: iw(lo.cardHeight, layout),
      color: toHex(card.node.textColor ?? style.nodeText),
      fontSize: ptSize(style.fontSize, layout),
      bold: style.fontWeight >= 600,
      align: "left",
      fontFace: toFontFace(style.fontFamily),
    });
  }

  return specs;
}

function specsChart(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const lo = chartLayout(visual);
  const labelFont = Math.max(10, style.fontSize - 1);
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  specs.push({
    kind: "line",
    x1: ix(lo.marginLeft, layout),
    y1: iy(lo.baselineY, layout),
    x2: ix(lo.marginLeft + lo.plotWidth, layout),
    y2: iy(lo.baselineY, layout),
    color: toHex(style.edgeColor),
    strokeWidth: 1.5,
  });

  for (let i = 0; i < lo.bars.length; i++) {
    const bar = lo.bars[i];
    const color = bar.node.color ?? pick(style.palette, i);
    const textColor = bar.node.textColor ?? style.nodeText;

    if (bar.barHeight > 0) {
      specs.push({
        kind: "rect",
        x: ix(bar.barX, layout),
        y: iy(bar.barY, layout),
        w: iw(bar.barWidth, layout),
        h: iw(bar.barHeight, layout),
        fill: toHex(color),
        stroke: toHex(color),
        strokeWidth: 0,
        cornerRadius: iw(6, layout),
      });
    }

    // Value label above bar
    if (bar.value !== 0) {
      specs.push({
        kind: "text",
        text: String(bar.value),
        x: ix(bar.centerX - bar.barWidth / 2, layout),
        y: iy(bar.barY - labelFont * 2, layout),
        w: iw(bar.barWidth, layout),
        h: iw(labelFont * 2, layout),
        color: toHex(textColor),
        fontSize: ptSize(labelFont, layout),
        bold: true,
        align: "center",
        fontFace: toFontFace(style.fontFamily),
      });
    }

    // Node label below baseline
    specs.push({
      kind: "text",
      text: bar.node.label,
      x: ix(bar.centerX - lo.slot / 2, layout),
      y: iy(lo.baselineY + 4, layout),
      w: iw(lo.slot, layout),
      h: iw(36, layout),
      color: toHex(textColor),
      fontSize: ptSize(labelFont, layout),
      bold: false,
      align: "center",
      fontFace: toFontFace(style.fontFamily),
    });
  }

  return specs;
}

function specsTimeline(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const lo = timelineLayout(visual);
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  if (visual.nodes.length > 1) {
    specs.push({
      kind: "line",
      x1: ix(lo.firstCenterX, layout),
      y1: iy(lo.axisY, layout),
      x2: ix(lo.lastCenterX, layout),
      y2: iy(lo.axisY, layout),
      color: toHex(style.edgeColor),
      strokeWidth: 2,
    });
  }

  for (let i = 0; i < lo.steps.length; i++) {
    const step = lo.steps[i];
    const accent = step.node.color ?? pick(style.palette, i);
    const cardEdgeY = step.above ? step.cardY + lo.cardHeight : step.cardY;

    // Stem line
    specs.push({
      kind: "line",
      x1: ix(step.centerX, layout),
      y1: iy(lo.axisY, layout),
      x2: ix(step.centerX, layout),
      y2: iy(cardEdgeY, layout),
      color: toHex(style.edgeColor),
      strokeWidth: 1.5,
    });

    // Card
    specs.push({
      kind: "rect",
      x: ix(step.cardX, layout),
      y: iy(step.cardY, layout),
      w: iw(lo.cardWidth, layout),
      h: iw(lo.cardHeight, layout),
      fill: toHex(style.nodeFill),
      stroke: toHex(step.node.stroke ?? style.nodeStroke),
      strokeWidth: 1,
      cornerRadius: iw(12, layout),
    });

    // Card label
    specs.push({
      kind: "text",
      text: step.node.label,
      x: ix(step.cardX, layout),
      y: iy(step.cardY, layout),
      w: iw(lo.cardWidth, layout),
      h: iw(lo.cardHeight, layout),
      color: toHex(step.node.textColor ?? style.nodeText),
      fontSize: ptSize(style.fontSize, layout),
      bold: style.fontWeight >= 600,
      align: "center",
      fontFace: toFontFace(style.fontFamily),
    });

    // Badge circle
    specs.push({
      kind: "ellipse",
      x: ix(step.centerX - lo.badgeRadius, layout),
      y: iy(lo.axisY - lo.badgeRadius, layout),
      w: iw(lo.badgeRadius * 2, layout),
      h: iw(lo.badgeRadius * 2, layout),
      fill: toHex(accent),
      stroke: toHex(accent),
      strokeWidth: 0,
    });

    // Badge number
    specs.push({
      kind: "text",
      text: String(i + 1),
      x: ix(step.centerX - lo.badgeRadius, layout),
      y: iy(lo.axisY - lo.badgeRadius, layout),
      w: iw(lo.badgeRadius * 2, layout),
      h: iw(lo.badgeRadius * 2, layout),
      color: "FFFFFF",
      fontSize: ptSize(style.fontSize, layout),
      bold: true,
      align: "center",
      fontFace: toFontFace(style.fontFamily),
    });
  }

  return specs;
}

function specsCycle(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const lo = cycleLayout(visual);
  const { placements } = lo;
  const count = placements.length;
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  // Connecting lines between consecutive nodes
  if (count > 1) {
    for (let i = 0; i < count; i++) {
      const from = placements[i];
      const to = placements[(i + 1) % count];
      const fromCenter: Point = { x: from.x, y: from.y };
      const toCenter: Point = { x: to.x, y: to.y };
      const start = boundaryPoint(
        toCenter,
        fromCenter,
        from.width / 2,
        from.height / 2,
      );
      const end = boundaryPoint(
        fromCenter,
        toCenter,
        to.width / 2,
        to.height / 2,
      );
      specs.push({
        kind: "line",
        x1: ix(start.x, layout),
        y1: iy(start.y, layout),
        x2: ix(end.x, layout),
        y2: iy(end.y, layout),
        color: toHex(pick(style.palette, i)),
        strokeWidth: 2.5,
        arrowEnd: true,
      });
    }
  }

  // Nodes (pill shape)
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const accent = p.node.color ?? pick(style.palette, i);
    const nodeForShape: VisualNode = {
      ...p.node,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    };
    specs.push(
      nodeShapeSpec(
        nodeForShape,
        accent,
        accent,
        0,
        layout,
        p.node.shape ?? "pill",
      ),
    );
    specs.push(
      nodeLabelSpec(
        nodeForShape,
        p.node.textColor ?? "#ffffff",
        style,
        layout,
        style.fontSize,
        style.fontWeight,
      ),
    );
  }

  return specs;
}

function specsComparison(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const lo = comparisonLayout(visual);
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  for (const cell of lo.cells) {
    const paletteColor = pick(style.palette, cell.column);
    const isHeader = cell.header;
    const fill = isHeader
      ? toHex(cell.node.color ?? paletteColor)
      : toHex(cell.node.color ?? style.nodeFill);
    const stroke = isHeader
      ? toHex(cell.node.stroke ?? cell.node.color ?? paletteColor)
      : toHex(cell.node.stroke ?? paletteColor);
    const textColor = isHeader
      ? toHex(cell.node.textColor ?? "#ffffff")
      : toHex(cell.node.textColor ?? style.nodeText);

    specs.push({
      kind: "rect",
      x: ix(cell.x - cell.width / 2, layout),
      y: iy(cell.cardY, layout),
      w: iw(cell.width, layout),
      h: iw(cell.height, layout),
      fill,
      stroke,
      strokeWidth: isHeader ? 0 : 1.5,
      cornerRadius: iw(12, layout),
    });

    specs.push({
      kind: "text",
      text: cell.node.label,
      x: ix(cell.x - cell.width / 2, layout),
      y: iy(cell.cardY, layout),
      w: iw(cell.width, layout),
      h: iw(cell.height, layout),
      color: textColor,
      fontSize: ptSize(isHeader ? style.fontSize + 1 : style.fontSize, layout),
      bold: isHeader
        ? Math.min(style.fontWeight + 100, 900) >= 600
        : style.fontWeight >= 600,
      align: "center",
      fontFace: toFontFace(style.fontFamily),
    });
  }

  return specs;
}

function specsMatrix(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
  const { style } = visual;
  const lo = matrixLayout(visual);
  const specs: PptxSpec[] = [];

  specs.push({
    kind: "rect",
    x: ix(0, layout),
    y: iy(0, layout),
    w: iw(visual.width, layout),
    h: iw(visual.height, layout),
    fill: toHex(style.background),
    stroke: toHex(style.background),
    strokeWidth: 0,
  });

  // Quadrant backgrounds
  for (const quad of lo.quadrants) {
    const accent = pick(style.palette, quad.quadrant);
    specs.push({
      kind: "rect",
      x: ix(quad.cellX, layout),
      y: iy(quad.cellY, layout),
      w: iw(quad.cellWidth, layout),
      h: iw(quad.cellHeight, layout),
      fill: toHex(accent),
      fillTransparency: 88,
      stroke: toHex(accent),
      strokeWidth: 1.5,
      cornerRadius: iw(10, layout),
    });
  }

  // Divider lines
  specs.push({
    kind: "line",
    x1: ix(lo.dividerX, layout),
    y1: iy(lo.margin, layout),
    x2: ix(lo.dividerX, layout),
    y2: iy(visual.height - lo.margin, layout),
    color: toHex(style.edgeColor),
    strokeWidth: 1.5,
    dashed: true,
  });
  specs.push({
    kind: "line",
    x1: ix(lo.margin, layout),
    y1: iy(lo.dividerY, layout),
    x2: ix(visual.width - lo.margin, layout),
    y2: iy(lo.dividerY, layout),
    color: toHex(style.edgeColor),
    strokeWidth: 1.5,
    dashed: true,
  });

  // Quadrant node labels
  for (const quad of lo.quadrants) {
    if (quad.nodes.length === 0) continue;
    const accent = pick(style.palette, quad.quadrant);
    const rowHeight = quad.cellHeight / Math.max(quad.nodes.length, 1);

    for (let rowIndex = 0; rowIndex < quad.nodes.length; rowIndex++) {
      const node = quad.nodes[rowIndex];
      const isFirst = rowIndex === 0;
      const nodeCy = quad.cellY + rowHeight * rowIndex + rowHeight / 2;

      specs.push({
        kind: "text",
        text: node.label,
        x: ix(quad.cellX + 8, layout),
        y: iy(nodeCy - rowHeight / 2, layout),
        w: iw(quad.cellWidth - 16, layout),
        h: iw(rowHeight, layout),
        color: toHex(node.textColor ?? (isFirst ? accent : style.nodeText)),
        fontSize: ptSize(isFirst ? style.fontSize + 1 : style.fontSize, layout),
        bold: isFirst
          ? Math.min(style.fontWeight + 100, 900) >= 600
          : style.fontWeight >= 600,
        align: "center",
        fontFace: toFontFace(style.fontFamily),
      });
    }
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Converts a Visual into an array of PptxSpec descriptors ready to be applied
 * to a PptxGenJS slide.
 *
 * Returns `[{ kind: "image-fallback" }]` for visual kinds that cannot be
 * reasonably represented as native PowerPoint shapes.
 *
 * @param visual  The Visual to convert.
 * @param layout  Slide layout produced by {@link computeVisualSlideLayout}.
 */
export function visualToNativeSpecs(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
  switch (visual.type) {
    case "flowchart":
      return specsFlowchart(visual, layout);
    case "mindmap":
      return specsMindMap(visual, layout);
    case "concept":
      return specsConceptMap(visual, layout);
    case "orgchart":
      return specsOrgChart(visual, layout);
    case "venn":
      return specsVenn(visual, layout);
    case "list":
      return specsList(visual, layout);
    case "chart":
      return specsChart(visual, layout);
    case "timeline":
      return specsTimeline(visual, layout);
    case "cycle":
      return specsCycle(visual, layout);
    case "comparison":
      return specsComparison(visual, layout);
    case "matrix":
      return specsMatrix(visual, layout);
    case "funnel":
    case "pyramid":
      // Trapezoid shapes are not representable in PptxGenJS without custom
      // geometry — fall back to rasterised image for fidelity.
      return [{ kind: "image-fallback" }];
    default:
      return [{ kind: "image-fallback" }];
  }
}

/** Whether the specs array represents an image-fallback (non-native) result. */
export function isImageFallback(specs: PptxSpec[]): boolean {
  return specs.length === 1 && specs[0].kind === "image-fallback";
}
