/**
 * Applies {@link PptxSpec} descriptors to a PptxGenJS slide.
 *
 * This is the browser-side bridge between the pure descriptor layer
 * (`pptx-shapes.ts`) and the PptxGenJS API. It is intentionally kept separate
 * so the descriptor generation stays testable without a browser.
 */

import PptxGenJS from "pptxgenjs";

import type {
  PptxSpec,
  PptxRectSpec,
  PptxEllipseSpec,
  PptxDiamondSpec,
  PptxHexagonSpec,
  PptxLineSpec,
  PptxTextSpec,
} from "@/lib/visual/pptx-shapes";

type Slide = ReturnType<PptxGenJS["addSlide"]>;
type ShapeName = Parameters<Slide["addShape"]>[0];

const SHAPES = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  diamond: "diamond",
  hexagon: "hexagon",
  line: "line",
} satisfies Record<string, ShapeName>;

function applyRect(slide: Slide, spec: PptxRectSpec): void {
  const fill: PptxGenJS.ShapeFillProps =
    spec.fill === "none" || spec.fill === "NONE"
      ? { type: "none" }
      : {
          color: spec.fill,
          ...(spec.fillTransparency !== undefined
            ? { transparency: spec.fillTransparency }
            : {}),
        };

  const line: PptxGenJS.ShapeLineProps =
    spec.strokeWidth === 0
      ? { width: 0, color: spec.stroke }
      : { color: spec.stroke, width: spec.strokeWidth };

  if (spec.cornerRadius !== undefined && spec.cornerRadius > 0) {
    slide.addShape(SHAPES.roundRect, {
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: spec.h,
      fill,
      line,
      rectRadius: spec.cornerRadius,
    });
  } else {
    slide.addShape(SHAPES.rect, {
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: spec.h,
      fill,
      line,
    });
  }
}

function applyEllipse(slide: Slide, spec: PptxEllipseSpec): void {
  const fill: PptxGenJS.ShapeFillProps =
    spec.fill === "none" || spec.fill === "NONE"
      ? { type: "none" }
      : {
          color: spec.fill,
          ...(spec.fillTransparency !== undefined
            ? { transparency: spec.fillTransparency }
            : {}),
        };

  slide.addShape(SHAPES.ellipse, {
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    fill,
    line: { color: spec.stroke, width: spec.strokeWidth },
  });
}

function applyDiamond(slide: Slide, spec: PptxDiamondSpec): void {
  slide.addShape(SHAPES.diamond, {
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    fill: { color: spec.fill },
    line: { color: spec.stroke, width: spec.strokeWidth },
  });
}

function applyHexagon(slide: Slide, spec: PptxHexagonSpec): void {
  slide.addShape(SHAPES.hexagon, {
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    fill: { color: spec.fill },
    line: { color: spec.stroke, width: spec.strokeWidth },
  });
}

function applyLine(slide: Slide, spec: PptxLineSpec): void {
  // PptxGenJS LINE shape: x/y = start point, w/h = deltas.
  const w = spec.x2 - spec.x1;
  const h = spec.y2 - spec.y1;

  slide.addShape(SHAPES.line, {
    x: spec.x1,
    y: spec.y1,
    w,
    h,
    line: {
      color: spec.color,
      width: spec.strokeWidth,
      ...(spec.dashed ? { dashType: "dash" } : {}),
      ...(spec.arrowEnd ? { endArrowType: "triangle" } : {}),
    },
    // PptxGenJS needs flipH/flipV for negative deltas
    ...(w < 0 ? { flipH: true } : {}),
    ...(h < 0 ? { flipV: true } : {}),
  });
}

function applyText(slide: Slide, spec: PptxTextSpec): void {
  slide.addText(spec.text, {
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    color: spec.color,
    fontSize: spec.fontSize,
    bold: spec.bold ?? false,
    align: spec.align ?? "center",
    valign: "middle",
    fontFace: spec.fontFace,
    wrap: true,
  });
}

/**
 * Applies all non-image-fallback specs in `specs` to `slide`.
 * Image-fallback specs are silently skipped (the caller handles them).
 */
export function applySpecsToSlide(slide: Slide, specs: PptxSpec[]): void {
  for (const spec of specs) {
    switch (spec.kind) {
      case "rect":
        applyRect(slide, spec);
        break;
      case "ellipse":
        applyEllipse(slide, spec);
        break;
      case "diamond":
        applyDiamond(slide, spec);
        break;
      case "hexagon":
        applyHexagon(slide, spec);
        break;
      case "line":
        applyLine(slide, spec);
        break;
      case "text":
        applyText(slide, spec);
        break;
      case "image-fallback":
        // Caller is responsible for image embedding; skip silently.
        break;
    }
  }
}
