import type { Visual } from "@/lib/visual/schema";
import type { PptxSlideLayout, PptxSpec } from "@/lib/visual/pptx-shapes/types";
import {
  iw,
  ix,
  iy,
  pick,
  ptSize,
  specsForPositioned,
  toFontFace,
  toHex,
} from "@/lib/visual/pptx-shapes/shared";

export function specsFlowchart(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsMindMap(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsConceptMap(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsOrgChart(
  visual: Visual,
  layout: PptxSlideLayout,
): PptxSpec[] {
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

export function specsVenn(visual: Visual, layout: PptxSlideLayout): PptxSpec[] {
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
  /* node:coverage ignore next -- specsVenn closing brace maps as uncovered even when Venn specs are exercised. @preserve */
}
