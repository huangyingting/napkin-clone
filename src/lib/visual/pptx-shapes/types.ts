/**
 * PPTX shape descriptor types shared by native visual-family mappers.
 */

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

/** Sentinel instructing callers to rasterize the rendered SVG instead. */
export type PptxImageFallbackSpec = {
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

/** Translates canvas coordinates to slide-inch coordinates. */
export interface PptxSlideLayout {
  /** Inch offset of the visual area from the left edge of the slide. */
  offsetX: number;
  /** Inch offset of the visual area from the top edge of the slide. */
  offsetY: number;
  /** Canvas units → inches conversion factor. */
  scale: number;
}
