/**
 * Pure, DOM-free transform from a {@link Deck} into an ordered array of
 * {@link DeckSlideSpec} descriptors. One spec is produced per `deck.slides`
 * entry, in order.
 *
 * This module owns the spec descriptor types (DeckOp family, DeckSlideSpec)
 * and the `buildDeckSpecs` function. It has no browser or PptxGenJS
 * dependencies and is fully testable under `node --test`.
 *
 * Units: the deck uses percentage-based element boxes; `buildDeckSpecs`
 * converts them to inches against the chosen slide format's physical
 * dimensions. Font sizes are authored as a percent of slide height (`cqh`)
 * and converted to points.
 */

import type {
  Deck,
  ElementAlign,
  ElementBox,
  ImageCrop,
  ImageFitMode,
  ImageMaskShape,
  ShapeKind,
  Slide,
  TextFitMode,
  TextRun,
} from "@/lib/presentation/deck";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";
import { normalizeTextParagraphs } from "@/lib/presentation/deck";
import { slideFormatConfig } from "@/lib/presentation/slide-format";
import { resolveSlideStyle } from "@/lib/presentation/style-cascade";
import { slideFontExportFace } from "@/lib/presentation/slide-fonts";
import {
  adaptShapeLabelForExport,
  adaptTextElementForExport,
} from "@/lib/presentation/style-export-normalizers";
import { slideHeightPctToPoints } from "@/lib/presentation/style-units";
import type { Visual } from "@/lib/visual/schema";
import {
  buildDeckImageOp,
  buildDeckVisualOp,
} from "@/lib/visual/deck-fallback-ops";
import { toHex, type PptxSpec } from "@/lib/visual/pptx-shapes";
import { assertNever } from "@/lib/assert-never";

// ---------------------------------------------------------------------------
// Slide geometry
// ---------------------------------------------------------------------------

export interface DeckGeometry {
  pptxLayout: "LAYOUT_WIDE" | "LAYOUT_4X3";
  slideW: number;
  slideH: number;
  slideHPt: number;
}

export function deckGeometry(format: Deck["slideFormat"]): DeckGeometry {
  const config = slideFormatConfig(format);
  return {
    pptxLayout: config.pptxLayout,
    slideW: config.pptxWidthIn,
    slideH: config.pptxHeightIn,
    slideHPt: config.pptxHeightIn * 72,
  };
}

function exportTextRuns(
  runs: readonly TextRun[] | undefined,
  slideHeightPt: number,
): TextRun[] | undefined {
  if (!runs || runs.length === 0) return undefined;
  return runs.map((run) => ({
    ...run,
    ...(run.fontSize !== undefined
      ? { fontSize: slideHeightPctToPoints(run.fontSize, slideHeightPt) }
      : {}),
  }));
}

// ---------------------------------------------------------------------------
// Slide-spec descriptor model (pure, DOM-free)
// ---------------------------------------------------------------------------

/** Inch-space rectangle. */
interface InchBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional clockwise rotation in degrees (mirrors `element.rotation`). */
  rotation?: number;
  /** Optional drop shadow (mirrors `element.shadow`). */
  shadow?: boolean;
  /** Optional opacity in the `[0, 1]` range. */
  opacity?: number;
}

/** A run of text (single block) placed at an inch box. */
export interface DeckTextOp extends InchBox {
  kind: "text";
  text: string;
  /**
   * Optional rich-text runs for `text`. When present, the applier emits
   * run-level bold/italic/code/color formatting; absent → the plain `text`
   * string with the op-level defaults below.
   */
  runs?: TextRun[];
  /** Hex color without leading `#`. */
  color: string;
  /** Font size in points. */
  fontSize: number;
  /** Optional preferred font face (first resolved family only). */
  fontFace?: string;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  align: ElementAlign;
  /** Vertical alignment of text within its box. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** CSS line-height multiplier. */
  lineHeight?: number;
  /** Extra space below the text block, in points. */
  paragraphSpacingPt?: number;
  /** How content that exceeds the box is handled (mirrors `TextFitMode`). */
  fitMode?: TextFitMode;
}

/** A bulleted list placed at an inch box. */
export interface DeckBulletsOp extends InchBox {
  kind: "bullets";
  items: string[];
  underline?: boolean;
  /**
   * Optional rich-text runs, parallel to `items`: `itemRuns[i]` holds the
   * formatted spans for bullet line `i`. When an entry is present and non-empty
   * the applier emits run-level formatting for that line; otherwise it falls
   * back to the plain `items[i]` string.
   */
  itemRuns?: TextRun[][];
  /**
   * Per-item indent and list-type metadata (#335).  Parallel to `items`.
   * When present, `applyBulletsOp` uses indent levels and numbered-list
   * markers instead of the default flat bullet.
   */
  itemDetails?: ReadonlyArray<{
    indent?: number;
    listType?: "bullet" | "number";
  }>;
  color: string;
  fontSize: number;
  /** Optional preferred font face (first resolved family only). */
  fontFace?: string;
  bold: boolean;
  italic: boolean;
  align: ElementAlign;
  /** Vertical alignment of the bullet list within its box. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** CSS line-height multiplier. */
  lineHeight?: number;
  /** How content that exceeds the box is handled (mirrors `TextFitMode`). */
  fitMode?: TextFitMode;
}

/** A primitive shape placed at an inch box. */
export interface DeckShapeOp extends InchBox {
  kind: "shape";
  shape: ShapeKind;
  /** Hex color without leading `#`. */
  color: string;
  /** Optional centered label inside the shape. */
  text?: string;
  textRuns?: TextRun[];
  textColor?: string;
  fontSize?: number;
  fontFace?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: ElementAlign;
  /** Optional border/line stroke; `width` already converted to points. */
  stroke?: { color: string; width: number; dash?: boolean };
  /** Optional rect corner radius, already converted to inches. */
  radius?: number;
}

/** A raster image (data URL or path) placed at an inch box. */
export interface DeckImageOp extends InchBox {
  kind: "image";
  src: string;
  alt?: string;
  fitMode?: ImageFitMode;
  maskShape?: ImageMaskShape;
  crop?: ImageCrop;
  radius?: number;
}

/** A first-class connector element drawn between two absolute inch-space points. */
export interface DeckConnectorOp {
  kind: "connector";
  /** Start point in inches. */
  x1: number;
  y1: number;
  /** End point in inches. */
  x2: number;
  y2: number;
  /** Hex stroke color without leading `#`. */
  color: string;
  /** Stroke width in points. */
  width: number;
  /** When true the connector is rendered with a dash pattern. */
  dash?: boolean;
  /** Arrowhead at the start end of the line. */
  arrowStart?: "none" | "arrow" | "filled";
  /** Arrowhead at the end of the line. */
  arrowEnd?: "none" | "arrow" | "filled";
  /** Optional opacity in the `[0, 1]` range. */
  opacity?: number;
}

/** A visual rendered as native PptxGenJS shapes (no rasterisation needed). */
export interface DeckVisualNativeOp {
  kind: "visual-native";
  specs: PptxSpec[];
}

/** A visual that must be rasterised from its live SVG at apply time. */
export interface DeckVisualFallbackOp extends InchBox {
  kind: "visual-fallback";
  visualId: string;
}

export type DeckOp =
  | DeckTextOp
  | DeckBulletsOp
  | DeckShapeOp
  | DeckImageOp
  | DeckVisualNativeOp
  | DeckVisualFallbackOp
  | DeckConnectorOp;

/** One slide's worth of background + ordered draw operations. */
export interface DeckSlideSpec {
  /** Zero-based slide position, preserving `deck.slides` order. */
  index: number;
  /** Slide background — hex color without leading `#`. */
  background: string;
  /** Optional background image (data URL or path); takes precedence in render. */
  backgroundImage?: string;
  /** Slide accent — hex color without leading `#`. */
  accent: string;
  /** Draw operations in z-order (earlier = drawn first / underneath). */
  ops: DeckOp[];
}

// ---------------------------------------------------------------------------
// Shared text-style helper
// ---------------------------------------------------------------------------

/** Normalised text-style fields common to {@link DeckTextOp} and {@link DeckBulletsOp}. */
export interface ExportTextStyle {
  /** Hex color without leading `#`. */
  color: string;
  /** Font size in points. */
  fontSize: number;
  fontFace?: string;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  align: ElementAlign;
  /** Vertical alignment of text within its box. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** CSS line-height multiplier. */
  lineHeight?: number;
}

/**
 * Extract the text-styling fields shared by {@link DeckTextOp} and
 * {@link DeckBulletsOp} into a single {@link ExportTextStyle} record.
 *
 * Both the PPTX applier (`deck-export-pptx.ts`) and the SVG renderer
 * (`deck-export-slide-images.ts`) call this helper, giving the set of
 * "text style" properties a single definition.
 */
export function toExportTextStyle(
  op: Pick<
    DeckTextOp,
    | "color"
    | "fontSize"
    | "fontFace"
    | "bold"
    | "italic"
    | "underline"
    | "align"
    | "verticalAlign"
    | "lineHeight"
  >,
): ExportTextStyle {
  return {
    color: op.color,
    fontSize: op.fontSize,
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    ...(op.fontFace !== undefined ? { fontFace: op.fontFace } : {}),
    ...(op.underline ? { underline: true } : {}),
    ...(op.verticalAlign !== undefined
      ? { verticalAlign: op.verticalAlign }
      : {}),
    ...(op.lineHeight !== undefined ? { lineHeight: op.lineHeight } : {}),
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Convert a percentage {@link ElementBox} to an inch-space box. */
function boxToInches(box: ElementBox, geometry: DeckGeometry): InchBox {
  return {
    x: (box.x / 100) * geometry.slideW,
    y: (box.y / 100) * geometry.slideH,
    w: (box.w / 100) * geometry.slideW,
    h: (box.h / 100) * geometry.slideH,
  };
}

// ---------------------------------------------------------------------------
// Pure transform: Deck → DeckSlideSpec[]
// ---------------------------------------------------------------------------

/**
 * Pure, DOM-free transform turning a {@link Deck} into an ordered array of
 * {@link DeckSlideSpec}. One spec is produced per `deck.slides` entry, in order.
 *
 * @param deck     The edited deck (from `deckJson`).
 * @param visuals  Lookup of visual payloads by id, used for native shape mapping.
 */
export function buildDeckSpecs(
  deck: Deck,
  visuals: ReadonlyMap<string, Visual>,
): DeckSlideSpec[] {
  const geometry = deckGeometry(deck.slideFormat);
  return deck.slides.map((slide, index) =>
    buildSlideSpec(deck, slide, index, visuals, geometry),
  );
}

function buildSlideSpec(
  deck: Deck,
  slide: Slide,
  index: number,
  visuals: ReadonlyMap<string, Visual>,
  geometry: DeckGeometry,
): DeckSlideSpec {
  const resolved = resolveSlideStyle(deck, slide);
  const background = toHex(
    resolved.background.type === "solid"
      ? resolved.background.color
      : resolved.background.type === "gradient"
        ? resolved.background.from
        : "#ffffff",
  );
  const accent = toHex(resolved.accent);

  const elements = [...(slide.elements ?? [])]
    .filter((element) => !element.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);

  const ops: DeckOp[] = [];

  for (const element of elements) {
    const elementBox = element.box;
    const elementRotation = element.rotation;
    const box = boxToInches(elementBox, geometry);
    if (elementRotation) {
      box.rotation = elementRotation;
    }
    if (element.shadow) {
      box.shadow = true;
    }
    if (element.opacity !== undefined && element.opacity < 1) {
      box.opacity = Math.max(0, Math.min(1, element.opacity));
    }

    switch (element.kind) {
      case "text": {
        const exportStyle = adaptTextElementForExport(
          deck,
          { ...element, styleOverride: element.style },
          geometry.slideHPt,
        );
        const paragraphs = normalizeTextParagraphs(element);
        const hasListParagraphs = paragraphs.some(
          (paragraph) => paragraph.listType !== undefined,
        );
        if (hasListParagraphs) {
          const hasRichRuns = paragraphs.some(
            (paragraph) => paragraph.runs && paragraph.runs.length > 0,
          );
          const hasItemMeta = paragraphs.some(
            (paragraph) =>
              (paragraph.indent ?? 0) !== 0 || paragraph.listType === "number",
          );
          const bulletsFontFace = slideFontExportFace(
            exportStyle.resolved.fontFamily,
            paragraphs.map((paragraph) => paragraph.text).join(" "),
          );
          ops.push({
            kind: "bullets",
            ...box,
            items: paragraphs.map((paragraph) => paragraph.text),
            ...(hasRichRuns
              ? {
                  itemRuns: paragraphs.map(
                    (paragraph) =>
                      exportTextRuns(paragraph.runs, geometry.slideHPt) ?? [],
                  ),
                }
              : {}),
            ...(hasItemMeta
              ? {
                  itemDetails: paragraphs.map((paragraph) => ({
                    indent: paragraph.indent,
                    listType: paragraph.listType,
                  })),
                }
              : {}),
            color: toHex(exportStyle.color),
            fontSize: exportStyle.fontSizePt,
            ...(bulletsFontFace ? { fontFace: bulletsFontFace } : {}),
            bold: exportStyle.bold,
            italic: exportStyle.italic,
            ...(exportStyle.underline ? { underline: true } : {}),
            align: exportStyle.align,
            ...(element.style.verticalAlign
              ? { verticalAlign: element.style.verticalAlign }
              : {}),
            ...(exportStyle.lineHeight
              ? { lineHeight: exportStyle.lineHeight }
              : {}),
            ...(element.fitMode ? { fitMode: element.fitMode } : {}),
          });
          break;
        }
        // Content-aware editable-PPTX font face: registry fonts map to an
        // Office-compatible face, switching to the CJK face for Chinese text.
        const textFontFace = slideFontExportFace(
          exportStyle.resolved.fontFamily,
          element.text,
        );
        ops.push({
          kind: "text",
          ...box,
          text: element.text,
          ...(element.runs && element.runs.length > 0
            ? { runs: exportTextRuns(element.runs, geometry.slideHPt) }
            : {}),
          color: toHex(exportStyle.color),
          fontSize: exportStyle.fontSizePt,
          ...(textFontFace ? { fontFace: textFontFace } : {}),
          bold: exportStyle.bold,
          italic: exportStyle.italic,
          ...(exportStyle.underline ? { underline: true } : {}),
          align: exportStyle.align,
          ...(element.style.verticalAlign
            ? { verticalAlign: element.style.verticalAlign }
            : {}),
          ...(exportStyle.lineHeight
            ? { lineHeight: exportStyle.lineHeight }
            : {}),
          ...(exportStyle.paragraphSpacingPt
            ? { paragraphSpacingPt: exportStyle.paragraphSpacingPt }
            : {}),
          ...(element.fitMode ? { fitMode: element.fitMode } : {}),
        });
        break;
      }
      case "shape": {
        const labelStyle = adaptShapeLabelForExport(
          deck,
          { ...element, textStyleOverride: element.textStyle },
          geometry.slideHPt,
        );
        const minInch = Math.min(box.w, box.h);
        ops.push({
          kind: "shape",
          ...box,
          shape: element.shape,
          color: toHex(element.color),
          ...(element.text && element.shape !== "line"
            ? {
                text: element.text,
                ...(element.textRuns && element.textRuns.length > 0
                  ? {
                      textRuns: exportTextRuns(
                        element.textRuns,
                        geometry.slideHPt,
                      ),
                    }
                  : {}),
                textColor: toHex(labelStyle.color),
                fontSize: labelStyle.fontSizePt,
                ...(labelStyle.fontFace
                  ? { fontFace: labelStyle.fontFace }
                  : {}),
                bold: labelStyle.bold,
                italic: labelStyle.italic,
                ...(labelStyle.underline ? { underline: true } : {}),
                align: labelStyle.align,
              }
            : {}),
          ...(element.stroke
            ? {
                stroke: {
                  color: toHex(element.stroke.color),
                  width: (element.stroke.width / 100) * minInch * 72,
                },
              }
            : {}),
          ...(element.radius
            ? { radius: (element.radius / 100) * minInch }
            : {}),
        });
        break;
      }
      case "image": {
        const op = buildDeckImageOp(element, box, resolved.tokenSet.image);
        if (op) ops.push(op);
        break;
      }
      case "visual": {
        const visual = visuals.get(element.visualId);
        if (!visual) break;
        ops.push(
          buildDeckVisualOp(element, visual, box, resolved.tokenSet.visual),
        );
        break;
      }
      case "connector": {
        const { start: startPct, end: endPct } = resolveConnectorElementPoints(
          element,
          elements,
          (candidate) => candidate.box,
        );
        const connectorDefaults = resolved.tokenSet.connector;
        const strokeColor =
          element.stroke?.color ?? connectorDefaults?.color ?? "#a1a1aa";
        // Width is authored in `cqmin` (percent of shortest slide side); convert to pt.
        const minInch = Math.min(geometry.slideW, geometry.slideH);
        const strokeWidthPt = Math.max(
          1,
          ((element.stroke?.width ?? connectorDefaults?.width ?? 0.4) / 100) *
            minInch *
            72,
        );
        const dashed =
          element.dash ||
          (connectorDefaults?.dash !== undefined &&
            connectorDefaults.dash !== "solid");
        const arrowStart = element.arrowStart ?? connectorDefaults?.startArrow;
        const arrowEnd = element.arrowEnd ?? connectorDefaults?.endArrow;
        ops.push({
          kind: "connector",
          x1: (startPct.x / 100) * geometry.slideW,
          y1: (startPct.y / 100) * geometry.slideH,
          x2: (endPct.x / 100) * geometry.slideW,
          y2: (endPct.y / 100) * geometry.slideH,
          color: toHex(strokeColor),
          width: strokeWidthPt,
          ...(dashed ? { dash: true } : {}),
          ...(arrowStart ? { arrowStart } : {}),
          ...(arrowEnd ? { arrowEnd } : {}),
          ...(element.opacity !== undefined && element.opacity < 1
            ? { opacity: element.opacity }
            : {}),
        });
        break;
      }
      default:
        assertNever(element);
    }
  }

  return {
    index,
    background,
    ...(slide.backgroundImage
      ? { backgroundImage: slide.backgroundImage }
      : {}),
    accent,
    ops,
  };
}
