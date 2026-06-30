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

import type { DeckV7, Paragraph, TextContent } from "./schema";
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
  type VnextPptxTableOp,
  type BuildVnextPptxSpecOptions,
} from "./pptx-export-adapter";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function deckAssetSource(deck: DeckV7, assetId: string): string | undefined {
  return deck.assets.images[assetId]?.src ?? deck.assets.files?.[assetId]?.src;
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
          return {
            ...operation,
            assetId:
              deckAssetSource(deck, operation.assetId) ?? operation.assetId,
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
  slide.addImage({
    ...source,
    x,
    y,
    w,
    h,
    ...(alt ? { altText: alt } : {}),
    ...(rotation !== undefined ? { rotate: rotation } : {}),
  });
}

export function applyVnextConnectorOp(
  slide: PptxSlide,
  op: VnextPptxConnectorOp,
): void {
  const { x, y, w, stroke } = op;
  slide.addShape("line" as Parameters<PptxSlide["addShape"]>[0], {
    x,
    y,
    w,
    h: 0,
    ...(stroke !== undefined
      ? { line: { color: stroke.color, width: stroke.widthPt } }
      : {}),
  });
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
      // Visual ops require asset resolution at the call site; skipped here.
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
