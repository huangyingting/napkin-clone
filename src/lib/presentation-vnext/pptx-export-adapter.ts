/**
 * vNext PPTX export adapter.
 *
 * Converts a `ExportDeckSpec` (produced by `buildExportSpec` from a
 * `ResolvedDeckRenderTree`) into a `VnextPptxDeckSpec` — a DOM-free,
 * inch-based intermediate that a browser-side PptxGenJS applier can consume
 * without touching v6 element trees.
 *
 * Design notes:
 * - All coordinates are converted from the build-time pixel basis to PPTX
 *   inches at this boundary. The default pixel basis is 960×540 (matches
 *   `resolveDeckRenderTree` default). Pass `canvasWidthPx`/`canvasHeightPx`
 *   to override.
 * - Gradient and image fills emit diagnostics and fall back to a solid color.
 * - Effect styles (glass, blur, glow) emit unsupported-export-feature
 *   diagnostics; the shape still renders with a solid fill fallback.
 * - This module has no browser or PptxGenJS dependencies.
 */

import type { CanvasSpec } from "@/lib/presentation-vnext/types";
import type {
  StyleObject,
  FillStyle,
} from "@/lib/presentation-vnext/style-schema";
import type {
  TextContent,
  TableContent,
} from "@/lib/presentation-vnext/schema";
import type {
  ExportDeckSpec,
  ExportSlideSpec,
  ExportOperation,
  ExportTextOperation,
  ExportShapeOperation,
  ExportImageOperation,
  ExportConnectorOperation,
  ExportVisualOperation,
  ExportTableShapeOperation,
} from "@/lib/presentation-vnext/export-spec";
import { DiagnosticCollector } from "@/lib/presentation-vnext/diagnostics";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type VnextPptxLayout = "LAYOUT_WIDE" | "LAYOUT_4X3" | "LAYOUT_CUSTOM";

export type VnextPptxTextStyle = {
  color?: string;
  fontSize?: number;
  fontFace?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
};

export type VnextPptxBackgroundOp = {
  type: "background";
  fill?: string;
};

export type VnextPptxTextOp = {
  type: "text";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content: TextContent;
  textStyle: VnextPptxTextStyle;
  rotation?: number;
  zIndex: number;
};

export type VnextPptxShapeOp = {
  type: "shape";
  id: string;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: { color: string; widthPt: number };
  text?: TextContent;
  textStyle?: VnextPptxTextStyle;
  rotation?: number;
  zIndex: number;
};

export type VnextPptxImageOp = {
  type: "image";
  id: string;
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alt?: string;
  rotation?: number;
  zIndex: number;
};

export type VnextPptxConnectorOp = {
  type: "connector";
  id: string;
  from: unknown;
  to: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke?: { color: string; widthPt: number };
  zIndex: number;
};

export type VnextPptxVisualOp = {
  type: "visual";
  id: string;
  assetId?: string;
  visualId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alt?: string;
  rotation?: number;
  zIndex: number;
};

export type VnextPptxTableOp = {
  type: "tableShape";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  table: TableContent;
  headerFill?: string;
  rowFill?: string;
  textStyle?: VnextPptxTextStyle;
  zIndex: number;
};

export type VnextPptxOp =
  | VnextPptxTextOp
  | VnextPptxShapeOp
  | VnextPptxImageOp
  | VnextPptxConnectorOp
  | VnextPptxVisualOp
  | VnextPptxTableOp;

export type VnextPptxSlideSpec = {
  id: string;
  background: VnextPptxBackgroundOp;
  ops: VnextPptxOp[];
  notes?: string;
};

export type VnextPptxDeckSpec = {
  layout: VnextPptxLayout;
  slideW: number;
  slideH: number;
  slides: VnextPptxSlideSpec[];
  diagnostics: PresentationDiagnostic[];
};

export interface BuildVnextPptxSpecOptions {
  /** Pixel width of the canvas used when resolving the render tree. Default: 960. */
  canvasWidthPx?: number;
  /** Pixel height of the canvas used when resolving the render tree. Default: 540. */
  canvasHeightPx?: number;
}

// ---------------------------------------------------------------------------
// Canvas → PPTX dimensions
// ---------------------------------------------------------------------------

type PptxDimensions = {
  layout: VnextPptxLayout;
  slideW: number;
  slideH: number;
};

function canvasToPptxDimensions(canvas: CanvasSpec): PptxDimensions {
  switch (canvas.format) {
    case "16:9":
      return { layout: "LAYOUT_WIDE", slideW: 13.333, slideH: 7.5 };
    case "4:3":
      return { layout: "LAYOUT_4X3", slideW: 10, slideH: 7.5 };
    case "square":
      return { layout: "LAYOUT_CUSTOM", slideW: 7.5, slideH: 7.5 };
    case "custom": {
      // Scale so the larger axis is 13.333 in
      const ratio = canvas.width / Math.max(canvas.height, 0.01);
      const slideW = Math.min(13.333, 13.333);
      const slideH = slideW / ratio;
      return { layout: "LAYOUT_CUSTOM", slideW, slideH };
    }
  }
}

// ---------------------------------------------------------------------------
// Pixel → inch conversion
// ---------------------------------------------------------------------------

function pxToIn(
  frame: { x: number; y: number; w: number; h: number },
  basisW: number,
  basisH: number,
  slideW: number,
  slideH: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: (frame.x / basisW) * slideW,
    y: (frame.y / basisH) * slideH,
    w: (frame.w / basisW) * slideW,
    h: (frame.h / basisH) * slideH,
  };
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Strips leading `#` for PptxGenJS bare hex strings. */
function toHex(color: string): string {
  const s = color.trim();
  if (s.startsWith("#")) return s.slice(1).toUpperCase();
  return s.toUpperCase();
}

/** Resolves a ColorValue to a hex string, emitting a diagnostic for token refs. */
function resolveColor(
  color: unknown,
  fallback: string,
  dc: DiagnosticCollector,
  ctx: string,
): string {
  if (typeof color === "string") return toHex(color);
  // Unresolved token ref — render resolver should have resolved these
  dc.warning(
    "missing-token",
    `${ctx}: unresolved token ref in export; using fallback color`,
    { path: ctx },
  );
  return toHex(fallback);
}

/** Converts a FillStyle to a hex color, emitting diagnostics for unsupported types. */
function fillToHex(
  fill: FillStyle | undefined,
  dc: DiagnosticCollector,
  ctx: string,
): string | undefined {
  if (!fill) return undefined;
  if (fill.type === "solid") {
    return resolveColor(fill.color, "#cccccc", dc, ctx);
  }
  if (fill.type === "linearGradient") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: linear gradient fill uses from-color fallback in PPTX export`,
      { path: ctx, action: "replace-style-ref" },
    );
    return resolveColor(fill.from, "#cccccc", dc, ctx);
  }
  if (fill.type === "radialGradient") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: radial gradient fill uses inner-color fallback in PPTX export`,
      { path: ctx, action: "replace-style-ref" },
    );
    return resolveColor(fill.inner, "#cccccc", dc, ctx);
  }
  if (fill.type === "conicGradient") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: conic gradient fill uses first-stop fallback in PPTX export`,
      { path: ctx, action: "replace-style-ref" },
    );
    return resolveColor(fill.stops[0]?.color, "#cccccc", dc, ctx);
  }
  if (fill.type === "repeatingLinearGradient") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: repeating gradient fill uses first-stop fallback in PPTX export`,
      { path: ctx, action: "replace-style-ref" },
    );
    return resolveColor(fill.stops[0]?.color, "#cccccc", dc, ctx);
  }
  if (fill.type === "pattern") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: pattern fill uses background/color fallback in PPTX export`,
      { path: ctx, action: "replace-style-ref" },
    );
    return resolveColor(fill.background ?? fill.color, "#cccccc", dc, ctx);
  }
  if (fill.type === "image") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: image fill is not supported in PPTX export; using no fill`,
      { path: ctx, action: "replace-style-ref" },
    );
    return undefined;
  }
  return undefined;
}

/** Extracts text style options from a resolved StyleObject. */
function styleToTextOptions(style: StyleObject): VnextPptxTextStyle {
  const text = style.text;
  if (!text) return {};
  return {
    ...(text.color !== undefined
      ? {
          color: typeof text.color === "string" ? toHex(text.color) : undefined,
        }
      : {}),
    ...(text.fontSizePt !== undefined ? { fontSize: text.fontSizePt } : {}),
    ...(typeof text.fontFamily === "string"
      ? { fontFace: text.fontFamily }
      : {}),
    ...(text.weight !== undefined && text.weight >= 700 ? { bold: true } : {}),
    ...(text.italic ? { italic: true } : {}),
    ...(text.underline ? { underline: true } : {}),
    ...(text.align ? { align: text.align } : {}),
    ...(text.verticalAlign ? { valign: text.verticalAlign } : {}),
  };
}

/** Emits diagnostics for unsupported effect styles. */
function checkEffect(
  style: StyleObject,
  dc: DiagnosticCollector,
  ctx: string,
): void {
  if (!style.effect) return;
  const kind = style.effect.kind;
  if (kind === "glass" || kind === "blur" || kind === "glow") {
    dc.warning(
      "unsupported-export-feature",
      `${ctx}: "${kind}" effect uses a deterministic export fallback`,
      { path: ctx, action: "replace-style-ref" },
    );
  }
}

// ---------------------------------------------------------------------------
// Operation converters
// ---------------------------------------------------------------------------

function convertText(
  op: ExportTextOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxTextOp {
  const frame = pxToIn(op.frame, basis.w, basis.h, dims.slideW, dims.slideH);
  checkEffect(op.style, dc, `op(text:${op.id})`);
  return {
    type: "text",
    id: op.id,
    ...frame,
    content: op.content,
    textStyle: styleToTextOptions(op.style),
    ...(op.rotation !== undefined ? { rotation: op.rotation } : {}),
    zIndex: op.zIndex,
  };
}

function convertShape(
  op: ExportShapeOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxShapeOp {
  const frame = pxToIn(op.frame, basis.w, basis.h, dims.slideW, dims.slideH);
  checkEffect(op.style, dc, `op(shape:${op.id})`);
  const fill = fillToHex(op.style.fill, dc, `op(shape:${op.id}).fill`);
  const stroke = op.style.stroke
    ? {
        color: resolveColor(
          op.style.stroke.color,
          "#000000",
          dc,
          `op(shape:${op.id}).stroke`,
        ),
        widthPt: op.style.stroke.widthPt,
      }
    : undefined;
  return {
    type: "shape",
    id: op.id,
    shape: op.shape,
    ...frame,
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
    ...(op.text !== undefined ? { text: op.text } : {}),
    ...(op.text !== undefined
      ? { textStyle: styleToTextOptions(op.style) }
      : {}),
    ...(op.rotation !== undefined ? { rotation: op.rotation } : {}),
    zIndex: op.zIndex,
  };
}

function convertImage(
  op: ExportImageOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxImageOp {
  const frame = pxToIn(op.frame, basis.w, basis.h, dims.slideW, dims.slideH);
  checkEffect(op.style, dc, `op(image:${op.id})`);
  return {
    type: "image",
    id: op.id,
    assetId: op.assetId,
    ...frame,
    ...(op.alt !== undefined ? { alt: op.alt } : {}),
    ...(op.rotation !== undefined ? { rotation: op.rotation } : {}),
    zIndex: op.zIndex,
  };
}

function convertConnector(
  op: ExportConnectorOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxConnectorOp {
  const frame = pxToIn(op.frame, basis.w, basis.h, dims.slideW, dims.slideH);
  const stroke = op.style.stroke
    ? {
        color: resolveColor(
          op.style.stroke.color,
          "#000000",
          dc,
          `op(connector:${op.id}).stroke`,
        ),
        widthPt: op.style.stroke.widthPt,
      }
    : undefined;
  return {
    type: "connector",
    id: op.id,
    from: op.from,
    to: op.to,
    ...frame,
    ...(stroke !== undefined ? { stroke } : {}),
    zIndex: op.zIndex,
  };
}

function convertVisual(
  op: ExportVisualOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxVisualOp {
  const frame = pxToIn(op.frame, basis.w, basis.h, dims.slideW, dims.slideH);
  checkEffect(op.style, dc, `op(visual:${op.id})`);
  if (!op.assetId && !op.visualId) {
    dc.warning(
      "missing-asset",
      `Visual op "${op.id}" has neither assetId nor visualId; PPTX export will skip`,
      { path: `op(visual:${op.id})`, action: "open-asset-panel" },
    );
  }
  return {
    type: "visual",
    id: op.id,
    ...(op.assetId !== undefined ? { assetId: op.assetId } : {}),
    ...(op.visualId !== undefined ? { visualId: op.visualId } : {}),
    ...frame,
    ...(op.alt !== undefined ? { alt: op.alt } : {}),
    ...(op.rotation !== undefined ? { rotation: op.rotation } : {}),
    zIndex: op.zIndex,
  };
}

function convertTable(
  op: ExportTableShapeOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxTableOp {
  const frame = pxToIn(op.frame, basis.w, basis.h, dims.slideW, dims.slideH);
  const tableStyle = op.style.table;
  const headerFill = tableStyle?.headerFill
    ? fillToHex(tableStyle.headerFill, dc, `op(table:${op.id}).headerFill`)
    : undefined;
  const rowFill = tableStyle?.rowFill
    ? fillToHex(tableStyle.rowFill, dc, `op(table:${op.id}).rowFill`)
    : undefined;
  return {
    type: "tableShape",
    id: op.id,
    ...frame,
    table: op.table,
    ...(headerFill !== undefined ? { headerFill } : {}),
    ...(rowFill !== undefined ? { rowFill } : {}),
    ...(tableStyle?.text
      ? { textStyle: styleToTextOptions({ text: tableStyle.text }) }
      : {}),
    zIndex: op.zIndex,
  };
}

function convertOperation(
  op: ExportOperation,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxOp | null {
  switch (op.type) {
    case "text":
      return convertText(op, basis, dims, dc);
    case "shape":
      return convertShape(op, basis, dims, dc);
    case "image":
      return convertImage(op, basis, dims, dc);
    case "connector":
      return convertConnector(op, basis, dims, dc);
    case "visual":
      return convertVisual(op, basis, dims, dc);
    case "tableShape":
      return convertTable(op, basis, dims, dc);
    default: {
      const _: never = op;
      void _;
      dc.warning(
        "unsupported-export-feature",
        `Unknown export operation type in PPTX adapter`,
      );
      return null;
    }
  }
}

function convertSlide(
  slide: ExportSlideSpec,
  basis: { w: number; h: number },
  dims: PptxDimensions,
  dc: DiagnosticCollector,
): VnextPptxSlideSpec {
  const bgFill = slide.background.fill
    ? fillToHex(slide.background.fill, dc, `slide(${slide.id}).background`)
    : undefined;

  const ops: VnextPptxOp[] = [];
  for (const op of slide.operations) {
    const converted = convertOperation(op, basis, dims, dc);
    if (converted !== null) {
      ops.push(converted);
    }
  }

  return {
    id: slide.id,
    background: {
      type: "background",
      ...(bgFill !== undefined ? { fill: bgFill } : {}),
    },
    ops,
    ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a `ExportDeckSpec` (from `buildExportSpec`) into a DOM-free,
 * inch-based `VnextPptxDeckSpec` ready for a PptxGenJS browser applier.
 *
 * - Operation frames are converted from pixels (at the given pixel basis) to
 *   PPTX inches derived from the canvas format.
 * - Gradient / image fills emit `unsupported-export-feature` diagnostics and
 *   fall back to a solid color.
 * - Glass/blur/glow effects emit `unsupported-export-feature` diagnostics.
 * - Carry-forward diagnostics from the `ExportDeckSpec` are preserved.
 */
export function buildVnextPptxSpec(
  exportSpec: ExportDeckSpec,
  options: BuildVnextPptxSpecOptions = {},
): VnextPptxDeckSpec {
  const basisW = options.canvasWidthPx ?? 960;
  const basisH = options.canvasHeightPx ?? 540;
  const dims = canvasToPptxDimensions(exportSpec.canvas);
  const basis = { w: basisW, h: basisH };

  const dc = new DiagnosticCollector();
  for (const d of exportSpec.diagnostics) dc.add(d);

  const slides = exportSpec.slides.map((slide) =>
    convertSlide(slide, basis, dims, dc),
  );

  return {
    layout: dims.layout,
    slideW: dims.slideW,
    slideH: dims.slideH,
    slides,
    diagnostics: dc.diagnostics,
  };
}
