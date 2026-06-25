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
import type { Visual, VisualNode } from "@/lib/visual/schema";
import type { PptxSlideLayout, PptxSpec } from "@/lib/visual/pptx-shapes/types";
import {
  iw,
  ix,
  iy,
  nodeLabelSpec,
  nodeShapeSpec,
  pick,
  ptSize,
  toFontFace,
  toHex,
} from "@/lib/visual/pptx-shapes/shared";

export function specsList(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
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

export function specsChart(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsTimeline(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsCycle(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsComparison(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsMatrix(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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
