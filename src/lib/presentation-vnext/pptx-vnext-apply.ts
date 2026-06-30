/**
 * Browser-only v7 PPTX applier.
 *
 * Two public surfaces:
 *
 *  1. `applyVnextPptxSpec` — applies a `VnextPptxDeckSpec` (from
 *     `buildVnextPptxSpec`) to a new PptxGenJS instance and returns a PPTX
 *     Blob. Operates entirely on the inch-based intermediate; never touches v6
 *     element trees.
 *
 *  2. `exportDeckV7AsPPTX` — high-level orchestrator:
 *       DeckV7 + ThemePackageV1
 *         → resolveDeckRenderTree
 *         → buildExportSpec
 *         → buildVnextPptxSpec
 *         → applyVnextPptxSpec
 *         → Blob
 *
 * The pure helpers (`textContentToPptxRuns`, `vnextShapeToName`) are exported
 * for unit-testing with a mock slide target.
 */

import type PptxGenJS from "pptxgenjs";

import type {
  ConnectorEndpoint,
  DeckV7,
  Paragraph,
  TextContent,
} from "./schema";
import type { ThemePackageV1 } from "./theme-package-schema";
import { resolveThemePackageForDeck } from "./theme-package-registry";
import { resolveDeckRenderTree } from "./render-resolver";
import { buildExportSpec, type ExportDeckSpec } from "./export-spec";
import {
  buildVnextPptxSpec,
  type VnextPptxDeckSpec,
  type VnextPptxSlideSpec,
  type VnextPptxOp,
  type VnextPptxTextOp,
  type VnextPptxShapeOp,
  type VnextPptxImageOp,
  type VnextPptxConnectorOp,
  type VnextPptxVisualOp,
  type VnextPptxTableOp,
  type BuildVnextPptxSpecOptions,
} from "./pptx-export-adapter";
import { DEFAULT_VISUAL_CHANNEL_COLORS } from "./visual-channel-colors";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
type PptxCoord = number | `${number}%`;

function deckAssetSource(deck: DeckV7, assetId: string): string | undefined {
  const visualAssetId = deck.assets.visuals?.[assetId]?.id;
  return (
    deck.assets.images[assetId]?.src ??
    deck.assets.files?.[assetId]?.src ??
    (visualAssetId
      ? (deck.assets.images[visualAssetId]?.src ??
        deck.assets.files?.[visualAssetId]?.src)
      : undefined)
  );
}

export function resolveExportSpecAssetSources(
  deck: DeckV7,
  exportSpec: ExportDeckSpec,
): ExportDeckSpec {
  return {
    ...exportSpec,
    slides: exportSpec.slides.map((slide) => ({
      ...slide,
      operations: slide.operations.map((operation) => {
        if (operation.type === "image") {
          return {
            ...operation,
            assetId:
              deckAssetSource(deck, operation.assetId) ?? operation.assetId,
          };
        }
        if (operation.type === "visual" && operation.assetId) {
          const assetSource = deckAssetSource(deck, operation.assetId);
          const visualAsset = deck.assets.visuals?.[operation.assetId];
          const { assetId: originalAssetId, ...rest } = operation;
          void originalAssetId;
          return {
            ...rest,
            ...(assetSource ? { assetId: assetSource } : {}),
            ...(operation.visualId === undefined && visualAsset?.visualId
              ? { visualId: visualAsset.visualId }
              : {}),
            ...(operation.alt === undefined && visualAsset?.alt
              ? { alt: visualAsset.alt }
              : {}),
          };
        }
        return operation;
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// PptxGenJS slide type alias
// ---------------------------------------------------------------------------

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export type PptxTextRun = { text: string; options?: Record<string, unknown> };

/**
 * Converts a v7 `TextContent` into PptxGenJS text runs.
 * Each paragraph maps to one or more runs; paragraphs are separated by
 * breakLine markers so PptxGenJS renders them as separate lines in one text box.
 */
export function textContentToPptxRuns(content: TextContent): PptxTextRun[] {
  const runs: PptxTextRun[] = [];
  const { paragraphs } = content;

  for (let i = 0; i < paragraphs.length; i++) {
    const para: Paragraph = paragraphs[i];
    const isLastPara = i === paragraphs.length - 1;

    if (para.runs && para.runs.length > 0) {
      for (let j = 0; j < para.runs.length; j++) {
        const run = para.runs[j];
        const isLastRunInPara = j === para.runs.length - 1;
        const runOptions: Record<string, unknown> = {};
        if (run.bold) runOptions.bold = true;
        if (run.italic) runOptions.italic = true;
        if (run.underline) runOptions.underline = { style: "sng" };
        if (run.strikethrough) runOptions.strike = true;
        if (run.localStyle?.color && typeof run.localStyle.color === "string") {
          const c = run.localStyle.color.startsWith("#")
            ? run.localStyle.color.slice(1).toUpperCase()
            : run.localStyle.color.toUpperCase();
          runOptions.color = c;
        }
        if (run.localStyle?.fontSizePt !== undefined) {
          runOptions.fontSize = run.localStyle.fontSizePt;
        }
        if (run.link) runOptions.hyperlink = { url: run.link };
        if (isLastRunInPara && !isLastPara) runOptions.breakLine = true;
        runs.push({
          text: run.text === "\n" ? "" : run.text,
          options: runOptions,
        });
      }
    } else {
      const runOptions: Record<string, unknown> = {};
      if (!isLastPara) runOptions.breakLine = true;
      runs.push({ text: para.text, options: runOptions });
    }
  }
  return runs;
}

/**
 * Maps a v7 shape name string to a PptxGenJS shape name.
 * Falls back to `"rect"` for unknown shapes.
 */
export function vnextShapeToName(shape: string): string {
  const map: Record<string, string> = {
    rect: "rect",
    ellipse: "ellipse",
    circle: "ellipse",
    line: "line",
    triangle: "triangle",
    diamond: "diamond",
    roundRect: "roundRect",
  };
  return map[shape] ?? "rect";
}

// ---------------------------------------------------------------------------
// Op appliers (exported for testing with a mock slide)
// ---------------------------------------------------------------------------

export function applyVnextTextOp(slide: PptxSlide, op: VnextPptxTextOp): void {
  const { x, y, w, h, content, textStyle, rotation } = op;
  const runs = textContentToPptxRuns(content);
  const shared: Record<string, unknown> = {
    x,
    y,
    w,
    h,
    wrap: true,
    ...(textStyle.color !== undefined ? { color: textStyle.color } : {}),
    ...(textStyle.fontSize !== undefined
      ? { fontSize: textStyle.fontSize }
      : {}),
    ...(textStyle.fontFace !== undefined
      ? { fontFace: textStyle.fontFace }
      : {}),
    ...(textStyle.bold ? { bold: true } : {}),
    ...(textStyle.italic ? { italic: true } : {}),
    ...(textStyle.underline ? { underline: { style: "sng" } } : {}),
    ...(textStyle.align ? { align: textStyle.align } : {}),
    ...(textStyle.valign ? { valign: textStyle.valign } : {}),
    ...(rotation !== undefined ? { rotate: rotation } : {}),
  };

  if (runs.length === 1 && Object.keys(runs[0].options ?? {}).length === 0) {
    slide.addText(runs[0].text, shared as Parameters<PptxSlide["addText"]>[1]);
  } else {
    slide.addText(
      runs as Parameters<PptxSlide["addText"]>[0],
      shared as Parameters<PptxSlide["addText"]>[1],
    );
  }
}

export function applyVnextShapeOp(
  slide: PptxSlide,
  op: VnextPptxShapeOp,
): void {
  const { x, y, w, h, shape, fill, stroke, text, textStyle, rotation } = op;
  const shapeName = vnextShapeToName(shape) as Parameters<
    PptxSlide["addShape"]
  >[0];
  slide.addShape(shapeName, {
    x,
    y,
    w,
    h,
    ...(fill !== undefined ? { fill: { color: fill } } : {}),
    ...(stroke !== undefined
      ? { line: { color: stroke.color, width: stroke.widthPt } }
      : {}),
    ...(rotation !== undefined ? { rotate: rotation } : {}),
  });

  // Overlay shape label text if present
  if (text && text.paragraphs.length > 0) {
    const label = text.paragraphs
      .map((p) => p.text)
      .join(" ")
      .trim();
    if (label) {
      slide.addText(label, {
        x: x + w * 0.05,
        y: y + h * 0.1,
        w: w * 0.9,
        h: h * 0.8,
        ...(textStyle?.color !== undefined ? { color: textStyle.color } : {}),
        ...(textStyle?.fontSize !== undefined
          ? { fontSize: textStyle.fontSize }
          : {}),
        ...(textStyle?.align
          ? { align: textStyle.align as "left" | "center" | "right" }
          : {}),
        valign: "middle",
        wrap: true,
      });
    }
  }
}

export async function applyVnextImageOp(
  slide: PptxSlide,
  op: VnextPptxImageOp,
): Promise<void> {
  const { x, y, w, h, assetId, alt, rotation } = op;
  if (!assetId) return;
  // assetId is treated as a URL/data-URI; in a full integration
  // the caller resolves it before export.
  const source = assetId.startsWith("data:")
    ? { data: assetId }
    : { path: assetId };
  const sizing = imageSizingOptions(op);
  slide.addImage({
    ...source,
    x,
    y,
    w,
    h,
    ...(sizing !== undefined ? { sizing } : {}),
    ...(alt ? { altText: alt } : {}),
    ...(rotation !== undefined ? { rotate: rotation } : {}),
  });
}

function imageSizingOptions(op: VnextPptxImageOp):
  | {
      type: "contain" | "cover" | "crop";
      w: PptxCoord;
      h: PptxCoord;
      x?: PptxCoord;
      y?: PptxCoord;
    }
  | undefined {
  const crop = op.crop;
  const cropValues = crop ? [crop.top, crop.right, crop.bottom, crop.left] : [];
  const hasCrop = cropValues.some((value) => value > 0);
  if (crop && hasCrop) {
    const visibleW = Math.max(0, 100 - crop.left - crop.right);
    const visibleH = Math.max(0, 100 - crop.top - crop.bottom);
    return {
      type: "crop",
      x: toPercentCoord(crop.left),
      y: toPercentCoord(crop.top),
      w: toPercentCoord(visibleW),
      h: toPercentCoord(visibleH),
    };
  }
  if (op.fit === "contain" || op.fit === "cover") {
    return { type: op.fit, w: op.w, h: op.h };
  }

  function toPercentCoord(value: number): `${number}%` {
    return `${value}%`;
  }
  return undefined;
}

export async function applyVnextVisualOp(
  slide: PptxSlide,
  op: VnextPptxVisualOp,
): Promise<void> {
  const { x, y, w, h, assetId, alt, visualId, rotation } = op;
  if (assetId) {
    await applyVnextImageOp(slide, {
      type: "image",
      id: op.id,
      assetId,
      x,
      y,
      w,
      h,
      ...((alt ?? visualId) ? { alt: alt ?? visualId } : {}),
      ...(rotation !== undefined ? { rotation } : {}),
      zIndex: op.zIndex,
    });
    return;
  }

  const hasVisualPlaceholderStyling =
    op.channelColors !== undefined || op.transparentBackground !== undefined;
  if (hasVisualPlaceholderStyling) {
    const colors = {
      ...DEFAULT_VISUAL_CHANNEL_COLORS,
      ...op.channelColors,
    };
    const backgroundFill = op.transparentBackground
      ? undefined
      : { color: stripHash(colors.muted), transparency: 85 };
    slide.addShape("rect" as Parameters<PptxSlide["addShape"]>[0], {
      x,
      y,
      w,
      h,
      ...(backgroundFill ? { fill: backgroundFill } : {}),
      line: { color: stripHash(colors.muted), transparency: 35 },
      ...(rotation !== undefined ? { rotate: rotation } : {}),
    });
    const barW = w * 0.16;
    const baseY = y + h * 0.72;
    const bars = [
      { color: colors.primary, height: h * 0.42, offset: 0.18 },
      { color: colors.secondary, height: h * 0.3, offset: 0.4 },
      { color: colors.accent, height: h * 0.54, offset: 0.62 },
    ];
    for (const bar of bars) {
      slide.addShape("rect" as Parameters<PptxSlide["addShape"]>[0], {
        x: x + w * bar.offset,
        y: baseY - bar.height,
        w: barW,
        h: bar.height,
        fill: { color: stripHash(bar.color) },
        line: { color: stripHash(bar.color), transparency: 100 },
        ...(rotation !== undefined ? { rotate: rotation } : {}),
      });
    }
    slide.addText(op.alt ?? op.visualId ?? "Visual", {
      x: x + w * 0.12,
      y: y + h * 0.08,
      w: w * 0.76,
      h: h * 0.18,
      fontSize: Math.max(8, Math.min(14, h * 5)),
      color: stripHash(colors.primary),
      bold: true,
      align: "center",
      ...(rotation !== undefined ? { rotate: rotation } : {}),
    });
    return;
  }

  slide.addShape("rect" as Parameters<PptxSlide["addShape"]>[0], {
    x,
    y,
    w,
    h,
    fill: { color: op.fill ?? "F8FAFC" },
    line: {
      color: op.stroke?.color ?? "CBD5E1",
      width: op.stroke?.widthPt ?? 1,
      dashType: "dash",
    },
    ...(rotation !== undefined ? { rotate: rotation } : {}),
  });

  const label = op.fallbackLabel ?? alt ?? visualId ?? "Visual unavailable";
  slide.addText(label, {
    x: x + w * 0.05,
    y: y + h * 0.35,
    w: w * 0.9,
    h: h * 0.3,
    fontSize: 12,
    color: "475569",
    align: "center",
    valign: "middle",
    wrap: true,
    ...(rotation !== undefined ? { rotate: rotation } : {}),
  });
}

function stripHash(color: string): string {
  return color.startsWith("#")
    ? color.slice(1).toUpperCase()
    : color.toUpperCase();
}

function endpointPoint(endpoint: ConnectorEndpoint): { x: number; y: number } {
  if (endpoint.kind === "point") return endpoint.point;
  switch (endpoint.anchor) {
    case "top":
      return { x: 50, y: 0 };
    case "right":
      return { x: 100, y: 50 };
    case "bottom":
      return { x: 50, y: 100 };
    case "left":
      return { x: 0, y: 50 };
    case "center":
    default:
      return { x: 50, y: 50 };
  }
}

function endpointToInches(
  endpoint: ConnectorEndpoint,
  op: VnextPptxConnectorOp,
): { x: number; y: number } {
  const point = endpointPoint(endpoint);
  return {
    x: op.x + (op.w * point.x) / 100,
    y: op.y + (op.h * point.y) / 100,
  };
}

type ConnectorDash = NonNullable<VnextPptxConnectorOp["stroke"]>["dash"];

function dashToPptxDash(dash: ConnectorDash): "solid" | "dash" | "sysDot" {
  if (dash === "dashed") return "dash";
  if (dash === "dotted") return "sysDot";
  return "solid";
}

function arrowToPptxArrow(
  arrow: VnextPptxConnectorOp["startArrow"],
): "none" | "arrow" | "triangle" {
  if (arrow === "filled") return "triangle";
  if (arrow === "arrow") return "arrow";
  return "none";
}

function connectorLineOptions(
  op: VnextPptxConnectorOp,
  includeStartArrow: boolean,
  includeEndArrow: boolean,
): Record<string, unknown> | undefined {
  const line: Record<string, unknown> = {};
  if (op.stroke) {
    line.color = op.stroke.color;
    line.width = op.stroke.widthPt;
    line.dashType = dashToPptxDash(op.stroke.dash);
  }
  if (includeStartArrow && op.startArrow && op.startArrow !== "none") {
    line.beginArrowType = arrowToPptxArrow(op.startArrow);
  }
  if (includeEndArrow && op.endArrow && op.endArrow !== "none") {
    line.endArrowType = arrowToPptxArrow(op.endArrow);
  }
  return Object.keys(line).length > 0 ? line : undefined;
}

function addConnectorSegment(
  slide: PptxSlide,
  op: VnextPptxConnectorOp,
  start: { x: number; y: number },
  end: { x: number; y: number },
  includeStartArrow: boolean,
  includeEndArrow: boolean,
): void {
  const line = connectorLineOptions(op, includeStartArrow, includeEndArrow);
  slide.addShape("line" as Parameters<PptxSlide["addShape"]>[0], {
    x: start.x,
    y: start.y,
    w: end.x - start.x,
    h: end.y - start.y,
    ...(line !== undefined ? { line } : {}),
  });
}

export function applyVnextConnectorOp(
  slide: PptxSlide,
  op: VnextPptxConnectorOp,
): void {
  const start = endpointToInches(op.from, op);
  const end = endpointToInches(op.to, op);
  const routing = op.routing ?? "straight";

  if (routing === "elbow") {
    const midX = start.x + (end.x - start.x) / 2;
    const first = { x: midX, y: start.y };
    const second = { x: midX, y: end.y };
    addConnectorSegment(slide, op, start, first, true, false);
    addConnectorSegment(slide, op, first, second, false, false);
    addConnectorSegment(slide, op, second, end, false, true);
    return;
  }

  addConnectorSegment(slide, op, start, end, true, true);
}

export function applyVnextTableOp(
  slide: PptxSlide,
  op: VnextPptxTableOp,
): void {
  const { x, y, w, h, table, headerFill, rowFill, textStyle } = op;

  type PptxTableCell = { text: string; options?: Record<string, unknown> };

  const headerRow: PptxTableCell[] = table.columns.map((col) => ({
    text: col.label,
    options: {
      bold: true,
      ...(headerFill !== undefined ? { fill: { color: headerFill } } : {}),
      ...(textStyle?.fontSize !== undefined
        ? { fontSize: textStyle.fontSize }
        : {}),
      ...(textStyle?.fontFace !== undefined
        ? { fontFace: textStyle.fontFace }
        : {}),
    },
  }));

  const dataRows: PptxTableCell[][] = table.rows.map((row) =>
    row.cells.map((cell) => ({
      text: cell.text,
      options: {
        ...(rowFill !== undefined ? { fill: { color: rowFill } } : {}),
        ...(textStyle?.fontSize !== undefined
          ? { fontSize: textStyle.fontSize }
          : {}),
        ...(textStyle?.fontFace !== undefined
          ? { fontFace: textStyle.fontFace }
          : {}),
      },
    })),
  );

  slide.addTable(
    [headerRow, ...dataRows] as Parameters<PptxSlide["addTable"]>[0],
    {
      x,
      y,
      w,
      h,
    },
  );
}

// ---------------------------------------------------------------------------
// Per-op dispatch
// ---------------------------------------------------------------------------

async function applyOp(slide: PptxSlide, op: VnextPptxOp): Promise<void> {
  switch (op.type) {
    case "text":
      applyVnextTextOp(slide, op);
      break;
    case "shape":
      applyVnextShapeOp(slide, op);
      break;
    case "image":
      await applyVnextImageOp(slide, op);
      break;
    case "connector":
      applyVnextConnectorOp(slide, op);
      break;
    case "visual":
      await applyVnextVisualOp(slide, op);
      break;
    case "tableShape":
      applyVnextTableOp(slide, op);
      break;
    default: {
      const _: never = op;
      void _;
    }
  }
}

// ---------------------------------------------------------------------------
// Slide applier
// ---------------------------------------------------------------------------

async function applyVnextSlide(
  pptx: PptxGenJS,
  slideSpec: VnextPptxSlideSpec,
): Promise<void> {
  const slide = pptx.addSlide();
  const bgFill = slideSpec.background.fill;
  slide.background =
    bgFill !== undefined ? { color: bgFill } : { color: "FFFFFF" };

  // Ops are already in render order from the adapter (sorted by zIndex)
  for (const op of slideSpec.ops) {
    await applyOp(slide, op);
  }

  if (slideSpec.notes) {
    slide.addNotes(slideSpec.notes);
  }
}

// ---------------------------------------------------------------------------
// Public: spec applier
// ---------------------------------------------------------------------------

/**
 * Browser-only: applies a `VnextPptxDeckSpec` to a new PptxGenJS instance and
 * returns a PPTX Blob. Returns `null` on any assembly error.
 */
export async function applyVnextPptxSpec(
  spec: VnextPptxDeckSpec,
): Promise<Blob | null> {
  try {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const pptx = new PptxGenJS();
    pptx.layout = spec.layout;

    for (const slideSpec of spec.slides) {
      await applyVnextSlide(pptx, slideSpec);
    }

    const arrayBuffer = (await pptx.write({
      outputType: "arraybuffer",
    })) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: PPTX_MIME });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public: high-level v7 export
// ---------------------------------------------------------------------------

/**
 * Browser-only: resolves a `DeckV7` + `ThemePackageV1` into a PPTX Blob.
 * When the package is omitted, `DeckV7.theme.packageId` is resolved through
 * the runtime v7 theme package registry with neutral fallback.
 *
 * Pipeline:
 *   DeckV7 → resolveDeckRenderTree → buildExportSpec
 *          → buildVnextPptxSpec → applyVnextPptxSpec → Blob
 *
 * Returns `null` on any error (assembly failure, missing browser APIs, etc.).
 */
export async function exportDeckV7AsPPTX(
  deck: DeckV7,
  themePackage?: ThemePackageV1,
  options?: BuildVnextPptxSpecOptions,
): Promise<Blob | null> {
  try {
    const resolvedThemePackage =
      themePackage ?? resolveThemePackageForDeck(deck).package;
    const renderTree = resolveDeckRenderTree(deck, resolvedThemePackage);
    const exportSpec = resolveExportSpecAssetSources(
      deck,
      buildExportSpec(renderTree),
    );
    const pptxSpec = buildVnextPptxSpec(exportSpec, options);
    return applyVnextPptxSpec(pptxSpec);
  } catch {
    return null;
  }
}
