/**
 * Deck → PPTX export that honors the edited deck (`deckJson`).
 *
 * Unlike `exportDocumentAsPPTX` (document-export.ts), which re-derives one
 * slide per visual straight from the raw `DocumentBlock[]` and therefore
 * ignores every slide-editor change (reordering, retitling, free-form text,
 * shapes, images, etc.), this module walks an actual {@link Deck} and emits one
 * PptxGenJS slide per `deck.slides` entry. The authored content — including
 * free-form `elements`, per-slide `background`/`accent`, and reordered slides —
 * is preserved.
 *
 * Design (mirrors the pure/applier split used by pptx-shapes.ts + pptx-apply.ts):
 *  1. `buildDeckSpecs` — pure, DOM-free transform from a `Deck` into an array of
 *     `DeckSlideSpec` descriptors. Fully testable under `node --test`. It walks
 *     current slide `elements[]` and reuses `visualToNativeSpecs` for the
 *     visual→PPTX mapping.
 *  2. `exportDeckAsPPTX` — browser-only applier that walks the descriptors,
 *     creates a real PptxGenJS deck, applies each op, and resolves visual
 *     image-fallbacks via the supplied `getSvg` callback. Returns a Blob.
 *
 * Units: the deck is designed as a fixed-format surface with percentage-based
 * element boxes, so we target the deck's slide format and convert each
 * percentage box to inches against those dimensions. Font sizes are authored as
 * a percent of slide height (`cqh`) and converted to points against the chosen
 * physical slide height.
 */

import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

import type {
  BulletItem,
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
import {
  normalizeBulletItems,
  PLACEHOLDER_TYPE_LABELS,
} from "@/lib/presentation/deck";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";
import { slideFormatConfig } from "@/lib/presentation/slide-format";
import { resolveSlideStyle } from "@/lib/presentation/style-cascade";
import {
  resolveRoleToken,
  type DeckTextRole,
  type DeckThemeTokenSet,
} from "@/lib/presentation/deck-theme-tokens";
import type { Visual } from "@/lib/visual/schema";
import { exportPNG } from "@/lib/visual/export";
import { applySpecsToSlide } from "@/lib/visual/pptx-apply";
import { applyTheme } from "@/lib/visual/transforms";
import {
  isImageFallback,
  toHex,
  visualToNativeSpecs,
  type PptxSlideLayout,
  type PptxSpec,
} from "@/lib/visual/pptx-shapes";

// ---------------------------------------------------------------------------
// Slide geometry
// ---------------------------------------------------------------------------

interface DeckGeometry {
  pptxLayout: "LAYOUT_WIDE" | "LAYOUT_4X3";
  slideW: number;
  slideH: number;
  slideHPt: number;
}

function deckGeometry(format: Deck["slideFormat"]): DeckGeometry {
  const config = slideFormatConfig(format);
  return {
    pptxLayout: config.pptxLayout,
    slideW: config.pptxWidthIn,
    slideH: config.pptxHeightIn,
    slideHPt: config.pptxHeightIn * 72,
  };
}

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

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

/** Convert a `cqh` (percent-of-slide-height) font size to points. */
function fontSizePt(percentOfHeight: number, geometry: DeckGeometry): number {
  return Math.max(6, Math.round((percentOfHeight / 100) * geometry.slideHPt));
}

/**
 * PPTX only accepts a single font face, not a CSS family stack. We preserve the
 * author's first explicit family and let Office/system substitution handle the
 * rest, which keeps typography intentional while acknowledging platform drift.
 */
function primaryFontFace(fontFamily: string | undefined): string | undefined {
  if (!fontFamily) return undefined;
  const first = fontFamily
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .find((part) => part.length > 0);
  return first && first.toLowerCase() !== "inherit" ? first : undefined;
}

/**
 * Resolves the export font face for a text-bearing element (#606): the
 * element's own `fontFamily` override wins, otherwise the deck-template role
 * font (heading stack for heading/label roles, body stack otherwise) is
 * inherited from the cascade so exported text matches the editor's typography.
 */
function roleFontFace(
  ownFontFamily: string | undefined,
  role: DeckTextRole,
  tokenSet: DeckThemeTokenSet,
): string | undefined {
  return primaryFontFace(
    ownFontFamily ?? resolveRoleToken(tokenSet, role).fontFamily,
  );
}

/**
 * Build a {@link PptxSlideLayout} that fits a visual (in its own canvas units)
 * uniformly inside an inch box, centered. This places a visual element within
 * its authored free-form box rather than centering it on the whole slide.
 */
function layoutWithinBox(visual: Visual, box: InchBox): PptxSlideLayout {
  const scale = Math.min(box.w / visual.width, box.h / visual.height);
  const usedW = visual.width * scale;
  const usedH = visual.height * scale;
  return {
    offsetX: box.x + (box.w - usedW) / 2,
    offsetY: box.y + (box.h - usedH) / 2,
    scale,
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
      case "placeholder": {
        const label =
          element.label?.trim() ||
          PLACEHOLDER_TYPE_LABELS[element.placeholderType];
        const minInch = Math.min(box.w, box.h);
        ops.push({
          kind: "shape",
          ...box,
          shape: "rect",
          color: accent,
          opacity: 0.12,
          stroke: { color: accent, width: 1.5, dash: true },
          radius: minInch * 0.08,
        });
        ops.push({
          kind: "text",
          x: box.x + box.w * 0.08,
          y: box.y + box.h * 0.08,
          w: box.w * 0.84,
          h: box.h * 0.84,
          text: label,
          color: toHex(resolved.mutedColor),
          fontSize: fontSizePt(3.2, geometry),
          bold: true,
          italic: false,
          align: "center",
          verticalAlign: "middle",
        });
        break;
      }
      case "text": {
        const textRole: DeckTextRole =
          element.textRole ?? (element.role === "title" ? "h1" : "body");
        const defaultColor =
          element.role === "title" ? resolved.titleColor : resolved.bodyColor;
        const fontFace = roleFontFace(
          element.style.fontFamily,
          textRole,
          resolved.tokenSet,
        );
        ops.push({
          kind: "text",
          ...box,
          text: element.text,
          ...(element.runs && element.runs.length > 0
            ? { runs: element.runs }
            : {}),
          color: toHex(element.style.color ?? defaultColor),
          fontSize: fontSizePt(element.style.fontSize, geometry),
          ...(fontFace ? { fontFace } : {}),
          bold: element.style.bold,
          italic: element.style.italic,
          ...(element.style.underline ? { underline: true } : {}),
          align: element.style.align,
          ...(element.style.verticalAlign
            ? { verticalAlign: element.style.verticalAlign }
            : {}),
          ...(element.style.lineHeight
            ? { lineHeight: element.style.lineHeight }
            : {}),
          ...(element.style.paragraphSpacing
            ? {
                paragraphSpacingPt: fontSizePt(
                  element.style.paragraphSpacing,
                  geometry,
                ),
              }
            : {}),
          ...(element.fitMode ? { fitMode: element.fitMode } : {}),
        });
        break;
      }
      case "bullets": {
        // Use the authoritative item list.
        const bulletItems: BulletItem[] = normalizeBulletItems(element);
        const hasRichRuns = bulletItems.some(
          (it) => it.runs && it.runs.length > 0,
        );
        const hasItemMeta = bulletItems.some(
          (it) => (it.indent ?? 0) !== 0 || it.listType === "number",
        );
        ops.push({
          kind: "bullets",
          ...box,
          items: bulletItems.map((it) => it.text),
          ...(hasRichRuns
            ? { itemRuns: bulletItems.map((it) => it.runs ?? []) }
            : {}),
          ...(hasItemMeta
            ? {
                itemDetails: bulletItems.map((it) => ({
                  indent: it.indent,
                  listType: it.listType,
                })),
              }
            : {}),
          color: toHex(element.style.color ?? resolved.bodyColor),
          fontSize: fontSizePt(element.style.fontSize, geometry),
          ...(roleFontFace(
            element.style.fontFamily,
            element.textRole ?? "bullet",
            resolved.tokenSet,
          )
            ? {
                fontFace: roleFontFace(
                  element.style.fontFamily,
                  element.textRole ?? "bullet",
                  resolved.tokenSet,
                ),
              }
            : {}),
          bold: element.style.bold,
          italic: element.style.italic,
          ...(element.style.underline ? { underline: true } : {}),
          align: element.style.align,
          ...(element.style.verticalAlign
            ? { verticalAlign: element.style.verticalAlign }
            : {}),
          ...(element.style.lineHeight
            ? { lineHeight: element.style.lineHeight }
            : {}),
          ...(element.fitMode ? { fitMode: element.fitMode } : {}),
        });
        break;
      }
      case "shape": {
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
                  ? { textRuns: element.textRuns }
                  : {}),
                textColor: toHex(
                  element.textStyle?.color ?? resolved.bodyColor,
                ),
                fontSize: fontSizePt(
                  element.textStyle?.fontSize ?? 4,
                  geometry,
                ),
                ...(roleFontFace(
                  element.textStyle?.fontFamily,
                  element.textRole ?? "shapeLabel",
                  resolved.tokenSet,
                )
                  ? {
                      fontFace: roleFontFace(
                        element.textStyle?.fontFamily,
                        element.textRole ?? "shapeLabel",
                        resolved.tokenSet,
                      ),
                    }
                  : {}),
                bold: element.textStyle?.bold ?? false,
                italic: element.textStyle?.italic ?? false,
                ...(element.textStyle?.underline ? { underline: true } : {}),
                align: element.textStyle?.align ?? "center",
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
        // An image element with no source (e.g. one just added but never
        // filled in) must not emit an op — pptxgenjs would otherwise try to
        // load an empty path and break the export. Skip it instead.
        if (isEmptyImageSrc(element.src)) break;
        ops.push({
          kind: "image",
          ...box,
          src: element.src,
          ...(element.alt ? { alt: element.alt } : {}),
          ...((element.fitMode ?? resolved.tokenSet.image?.fitMode) !==
          undefined
            ? { fitMode: element.fitMode ?? resolved.tokenSet.image?.fitMode }
            : {}),
          ...((element.maskShape ?? resolved.tokenSet.image?.maskShape) !==
          undefined
            ? {
                maskShape:
                  element.maskShape ?? resolved.tokenSet.image?.maskShape,
              }
            : {}),
          ...(element.crop !== undefined ? { crop: element.crop } : {}),
          ...((element.radius ?? resolved.tokenSet.image?.radiusPct)
            ? {
                radius:
                  ((element.radius ?? resolved.tokenSet.image?.radiusPct ?? 0) /
                    100) *
                  Math.min(box.w, box.h),
              }
            : {}),
        });
        break;
      }
      case "visual": {
        const visual = visuals.get(element.visualId);
        if (!visual) break;
        // Honor the optional per-element restyle, mirroring the shared renderer
        // (slide-canvas VisualElementView) so the export matches what the editor
        // and present/public viewers draw. applyTheme is pure and node-safe.
        // Falls back to the deck-template default styleThemeId (#607).
        const styleThemeId =
          element.styleThemeId ?? resolved.tokenSet.visual?.styleThemeId;
        const styled = styleThemeId ? applyTheme(visual, styleThemeId) : visual;
        const layout = layoutWithinBox(styled, box);
        const specs = visualToNativeSpecs(styled, layout);
        if (
          isImageFallback(specs) ||
          box.rotation ||
          box.shadow ||
          box.opacity
        ) {
          ops.push({
            kind: "visual-fallback",
            ...box,
            visualId: element.visualId,
          });
        } else {
          ops.push({ kind: "visual-native", specs });
        }
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

// ---------------------------------------------------------------------------
// Browser-only applier
// ---------------------------------------------------------------------------

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;
type ShapeName = Parameters<PptxSlide["addShape"]>[0];

const SHAPES: Record<ShapeKind | "roundRect", ShapeName> = {
  rect: "rect",
  ellipse: "ellipse",
  line: "line",
  triangle: "triangle",
  roundRect: "roundRect",
};

/** Rasterise a live SVG to a PNG data URL (browser-only). */
async function svgToPngDataUrl(svg: SVGSVGElement): Promise<string | null> {
  const pngBlob = await exportPNG(svg, {
    background: "include",
    colorMode: "color",
    scale: 2,
  });
  if (!pngBlob) return null;
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(pngBlob);
  });
}

/** Monospace font face used to render inline-code runs in PPTX. */
const CODE_FONT_FACE = "Courier New";

/** Shared outer drop-shadow options for elements with `shadow` set. */
const SHADOW_OPTS = {
  type: "outer" as const,
  color: "000000",
  blur: 4,
  offset: 3,
  angle: 90,
  opacity: 0.3,
};

function opacityTransparency(opacity: number | undefined): number | undefined {
  if (opacity === undefined) return undefined;
  return Math.round((1 - opacity) * 100);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasImageCrop(crop: ImageCrop | undefined): crop is ImageCrop {
  return Boolean(
    crop &&
    (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0),
  );
}

function imageObjectPosition(crop: ImageCrop | undefined): string {
  if (!crop) return "50% 50%";
  const remainingX = Math.max(0, 1 - crop.left - crop.right);
  const remainingY = Math.max(0, 1 - crop.top - crop.bottom);
  const x = Math.max(0, Math.min(1, crop.left + remainingX / 2));
  const y = Math.max(0, Math.min(1, crop.top + remainingY / 2));
  return `${x * 100}% ${y * 100}%`;
}

function imageNeedsRasterFallback(op: DeckImageOp): boolean {
  return (
    (op.maskShape !== undefined && op.maskShape !== "none") ||
    (op.radius !== undefined && op.radius > 0) ||
    hasImageCrop(op.crop) ||
    op.fitMode === "none"
  );
}

function renderStyledImageSvg(
  op: DeckImageOp,
  pxPerIn = 192,
): SVGSVGElement | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }
  const width = Math.max(1, Math.round(op.w * pxPerIn));
  const height = Math.max(1, Math.round(op.h * pxPerIn));
  const radius =
    op.radius !== undefined && op.radius > 0 ? op.radius : undefined;
  const roundedRadiusPx =
    op.maskShape === "rounded"
      ? radius !== undefined
        ? Math.round(radius * pxPerIn)
        : Math.round(Math.min(width, height) * 0.12)
      : radius !== undefined
        ? Math.round(radius * pxPerIn)
        : 0;
  const maskCss =
    op.maskShape === "circle"
      ? "clip-path:circle(50% at 50% 50%);"
      : op.maskShape === "diamond"
        ? "clip-path:polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);"
        : roundedRadiusPx > 0
          ? `border-radius:${roundedRadiusPx}px;`
          : "";
  const cropCss = hasImageCrop(op.crop)
    ? `clip-path:inset(${op.crop.top * 100}% ${op.crop.right * 100}% ${op.crop.bottom * 100}% ${op.crop.left * 100}%);`
    : "";
  const fitMode = op.fitMode ?? "contain";
  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;${maskCss}">
      <div style="width:100%;height:100%;overflow:hidden;${cropCss}">
        <img src="${escapeXml(op.src)}" alt="${escapeXml(op.alt ?? "")}" style="display:block;width:100%;height:100%;object-fit:${fitMode};object-position:${imageObjectPosition(
          op.crop,
        )};" />
      </div>
    </div>
  </foreignObject>
</svg>`;
  const parsed = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const root = parsed.documentElement;
  return root.tagName === "svg" ? (root as unknown as SVGSVGElement) : null;
}

/** Per-run PptxGenJS text options derived from a {@link TextRun}'s formatting. */
function runToOptions(run: TextRun): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (run.bold) options.bold = true;
  if (run.italic) options.italic = true;
  if (run.code) options.fontFace = CODE_FONT_FACE;
  if (run.color) options.color = toHex(run.color);
  if (run.link) options.hyperlink = { url: run.link };
  return options;
}

type PptxTextRun = { text: string; options: Record<string, unknown> };

function applyTextOp(slide: PptxSlide, op: DeckTextOp): void {
  const pptxValign =
    op.verticalAlign === "top"
      ? ("top" as const)
      : op.verticalAlign === "bottom"
        ? ("bottom" as const)
        : ("middle" as const);
  const shared = {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    color: op.color,
    fontSize: op.fontSize,
    ...(op.fontFace ? { fontFace: op.fontFace } : {}),
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    valign: pptxValign,
    wrap: true,
    // `shrinkText: true` instructs PPTX to reduce font size until text fits.
    ...(op.fitMode === "shrink-to-fit" ? { shrinkText: true } : {}),
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.underline ? { underline: { style: "sng" as const } } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
    ...(opacityTransparency(op.opacity) !== undefined
      ? { transparency: opacityTransparency(op.opacity) }
      : {}),
    ...(op.lineHeight ? { lineSpacing: Math.round(op.lineHeight * 100) } : {}),
    ...(op.paragraphSpacingPt ? { paraSpaceAfter: op.paragraphSpacingPt } : {}),
  };

  if (op.runs && op.runs.length > 0) {
    const runs: PptxTextRun[] = op.runs.map((run) =>
      run.text === "\n"
        ? { text: "", options: { breakLine: true } }
        : { text: run.text, options: runToOptions(run) },
    );
    slide.addText(runs, shared);
    return;
  }

  slide.addText(op.text, shared);
}

function applyBulletsOp(slide: PptxSlide, op: DeckBulletsOp): void {
  const pptxValign =
    op.verticalAlign === "top"
      ? ("top" as const)
      : op.verticalAlign === "bottom"
        ? ("bottom" as const)
        : ("middle" as const);
  const shared = {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    color: op.color,
    fontSize: op.fontSize,
    ...(op.fontFace ? { fontFace: op.fontFace } : {}),
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    valign: pptxValign,
    wrap: true,
    // `shrinkText: true` instructs PPTX to reduce font size until text fits.
    ...(op.fitMode === "shrink-to-fit" ? { shrinkText: true } : {}),
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.underline ? { underline: { style: "sng" as const } } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
    ...(opacityTransparency(op.opacity) !== undefined
      ? { transparency: opacityTransparency(op.opacity) }
      : {}),
    ...(op.lineHeight ? { lineSpacing: Math.round(op.lineHeight * 100) } : {}),
  };

  const hasRuns =
    op.itemRuns !== undefined &&
    op.itemRuns.some((runs) => runs && runs.length > 0);

  /** Build the pptxgenjs `bullet` option for item at index `i`. */
  function bulletOpt(i: number): true | { type: "number" | "bullet" } {
    const detail = op.itemDetails?.[i];
    const isNumbered = detail?.listType === "number";
    if (!isNumbered && (detail?.indent ?? 0) === 0) return true;
    return { type: isNumbered ? "number" : "bullet" };
  }

  /** Return the paragraph-level indent depth for item at index `i`. */
  function itemIndentLevel(i: number): number {
    return op.itemDetails?.[i]?.indent ?? 0;
  }

  if (!hasRuns) {
    const runs = op.items.map((text, i) => ({
      text,
      options: {
        bullet: bulletOpt(i),
        indentLevel: itemIndentLevel(i),
        breakLine: i < op.items.length - 1,
      },
    }));
    slide.addText(runs, shared);
    return;
  }

  const runs: PptxTextRun[] = [];
  op.items.forEach((text, i) => {
    const isLastLine = i === op.items.length - 1;
    const lineRuns = op.itemRuns?.[i];
    if (lineRuns && lineRuns.length > 0) {
      lineRuns.forEach((run, j) => {
        const isLastRun = j === lineRuns.length - 1;
        runs.push({
          text: run.text === "\n" ? "" : run.text,
          options: {
            ...runToOptions(run),
            ...(j === 0
              ? { bullet: bulletOpt(i), indentLevel: itemIndentLevel(i) }
              : {}),
            ...(isLastRun && !isLastLine ? { breakLine: true } : {}),
          },
        });
      });
    } else {
      runs.push({
        text,
        options: {
          bullet: bulletOpt(i),
          indentLevel: itemIndentLevel(i),
          breakLine: !isLastLine,
        },
      });
    }
  });
  slide.addText(runs, shared);
}

function applyShapeTextOp(slide: PptxSlide, op: DeckShapeOp): void {
  if (!op.text || op.shape === "line") return;
  applyTextOp(slide, {
    kind: "text",
    text: op.text,
    ...(op.textRuns && op.textRuns.length > 0 ? { runs: op.textRuns } : {}),
    x: op.x + op.w * 0.08,
    y: op.y + op.h * 0.08,
    w: op.w * 0.84,
    h: op.h * 0.84,
    color: op.textColor ?? "18181b",
    fontSize: op.fontSize ?? 18,
    ...(op.fontFace ? { fontFace: op.fontFace } : {}),
    bold: op.bold ?? false,
    italic: op.italic ?? false,
    ...(op.underline ? { underline: true } : {}),
    align: op.align ?? "center",
    ...(op.rotation ? { rotation: op.rotation } : {}),
    ...(op.opacity !== undefined ? { opacity: op.opacity } : {}),
  });
}

function applyShapeOp(slide: PptxSlide, op: DeckShapeOp): void {
  const rotate = op.rotation ? { rotate: op.rotation } : {};
  const transparency = opacityTransparency(op.opacity);
  if (op.shape === "line") {
    // Render as a centered horizontal rule across the box.
    slide.addShape(SHAPES.line, {
      x: op.x,
      y: op.y + op.h / 2,
      w: op.w,
      h: 0,
      line: {
        color: op.stroke?.color ?? op.color,
        width: op.stroke?.width ?? 2,
        ...(op.stroke?.dash ? { dashType: "dash" as const } : {}),
        ...(transparency !== undefined ? { transparency } : {}),
      },
      ...rotate,
    });
    applyShapeTextOp(slide, op);
    return;
  }
  if (op.shape === "triangle") {
    slide.addShape(SHAPES.triangle, {
      x: op.x,
      y: op.y,
      w: op.w,
      h: op.h,
      fill: {
        color: op.color,
        ...(transparency !== undefined ? { transparency } : {}),
      },
      line: {
        width: 0,
        color: op.color,
        ...(transparency !== undefined ? { transparency } : {}),
      },
      ...rotate,
      ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
    });
    return;
  }
  const shapeName =
    op.shape === "ellipse"
      ? SHAPES.ellipse
      : op.radius
        ? SHAPES.roundRect
        : SHAPES.rect;
  slide.addShape(shapeName, {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    fill: {
      color: op.color,
      ...(transparency !== undefined ? { transparency } : {}),
    },
    line: op.stroke
      ? {
          color: op.stroke.color,
          width: op.stroke.width,
          ...(op.stroke.dash ? { dashType: "dash" as const } : {}),
          ...(transparency !== undefined ? { transparency } : {}),
        }
      : {
          width: 0,
          color: op.color,
          ...(transparency !== undefined ? { transparency } : {}),
        },
    ...(op.radius && op.shape !== "ellipse" ? { rectRadius: op.radius } : {}),
    ...rotate,
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
  });
  applyShapeTextOp(slide, op);
}

async function applyImageOp(slide: PptxSlide, op: DeckImageOp): Promise<void> {
  if (imageNeedsRasterFallback(op)) {
    const styledSvg = renderStyledImageSvg(op);
    if (styledSvg) {
      const pngDataUrl = await svgToPngDataUrl(styledSvg);
      if (pngDataUrl) {
        slide.addImage({
          data: pngDataUrl,
          x: op.x,
          y: op.y,
          w: op.w,
          h: op.h,
          ...(op.alt ? { altText: op.alt } : {}),
          ...(op.rotation ? { rotate: op.rotation } : {}),
          ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
        });
        return;
      }
    }
  }

  const source = op.src.startsWith("data:")
    ? { data: op.src }
    : { path: op.src };
  const fitMode = op.fitMode === "none" ? "contain" : (op.fitMode ?? "contain");
  slide.addImage({
    ...source,
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    ...(op.alt ? { altText: op.alt } : {}),
    ...(fitMode === "cover" || fitMode === "contain"
      ? { sizing: { type: fitMode, w: op.w, h: op.h } }
      : {}),
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
    ...(opacityTransparency(op.opacity) !== undefined
      ? { transparency: opacityTransparency(op.opacity) }
      : {}),
  });
}

/**
 * Renders a {@link DeckConnectorOp} as a PptxGenJS line shape drawn between the
 * two absolute inch-space endpoints. The shape's bounding box is computed from
 * the midpoint and hypotenuse length so that a rotation places the endpoints
 * exactly at (x1, y1) and (x2, y2).
 */
function applyConnectorOp(slide: PptxSlide, op: DeckConnectorOp): void {
  const dx = op.x2 - op.x1;
  const dy = op.y2 - op.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.001) return;
  const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
  const cx = (op.x1 + op.x2) / 2;
  const cy = (op.y1 + op.y2) / 2;
  slide.addShape(SHAPES.line, {
    x: cx - length / 2,
    y: cy,
    w: length,
    h: 0,
    line: {
      color: op.color,
      width: op.width,
      ...(op.dash ? { dashType: "dash" as const } : {}),
      ...(op.arrowEnd && op.arrowEnd !== "none"
        ? { endArrowType: "arrow" as const }
        : {}),
      ...(op.arrowStart && op.arrowStart !== "none"
        ? { beginArrowType: "arrow" as const }
        : {}),
      ...(opacityTransparency(op.opacity) !== undefined
        ? { transparency: opacityTransparency(op.opacity) }
        : {}),
    },
    rotate: angle,
  });
}

async function applyVisualFallbackOp(
  slide: PptxSlide,
  op: DeckVisualFallbackOp,
  getSvg: (visualId: string) => SVGSVGElement | null,
): Promise<void> {
  const svg = getSvg(op.visualId);
  if (!svg) return;
  const viewBox = svg.viewBox.baseVal;
  const vw = viewBox.width;
  const vh = viewBox.height;
  if (vw === 0 || vh === 0) return;

  const pngDataUrl = await svgToPngDataUrl(svg);
  if (!pngDataUrl) return;

  const ratio = Math.min(op.w / vw, op.h / vh);
  const imgW = vw * ratio;
  const imgH = vh * ratio;
  slide.addImage({
    data: pngDataUrl,
    x: op.x + (op.w - imgW) / 2,
    y: op.y + (op.h - imgH) / 2,
    w: imgW,
    h: imgH,
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
    ...(opacityTransparency(op.opacity) !== undefined
      ? { transparency: opacityTransparency(op.opacity) }
      : {}),
  });
}

async function applyDeckOp(
  slide: PptxSlide,
  op: DeckOp,
  getSvg: (visualId: string) => SVGSVGElement | null,
): Promise<void> {
  switch (op.kind) {
    case "text":
      applyTextOp(slide, op);
      break;
    case "bullets":
      applyBulletsOp(slide, op);
      break;
    case "shape":
      applyShapeOp(slide, op);
      break;
    case "image":
      await applyImageOp(slide, op);
      break;
    case "connector":
      applyConnectorOp(slide, op);
      break;
    case "visual-native":
      applySpecsToSlide(slide, op.specs);
      break;
    case "visual-fallback":
      await applyVisualFallbackOp(slide, op, getSvg);
      break;
  }
}

/**
 * Narrow test seam for applier-level unit tests. The pure spec tests cover
 * `buildDeckSpecs`; these helpers let Node tests assert that the resulting ops
 * are translated into the right PptxGenJS calls without constructing a real
 * `.pptx` archive.
 */
export const deckExportTestHelpers = {
  applyDeckOp,
  applyTextOp,
  applyBulletsOp,
  applyShapeOp,
  applyImageOp,
  applyConnectorOp,
  SHADOW_OPTS,
};

/**
 * Produces a PPTX deck that honors the edited `deck` (slide order, retitling,
 * free-form text/shapes/images, per-slide background/accent), emitting one
 * slide per `deck.slides` entry.
 *
 * Visuals are embedded as native PptxGenJS shapes when possible; kinds that
 * cannot be represented natively (funnel, pyramid) fall back to a rasterised
 * PNG resolved from the live SVG via `getSvg`.
 *
 * @param deck     The edited deck (typically from `deckJson`).
 * @param visuals  Lookup of visual payloads by id (for native shape mapping).
 * @param getSvg   Resolves a live `SVGSVGElement` for a visual id (image fallback).
 * @returns A PPTX Blob, or `null` if assembly fails.
 */
export async function exportDeckAsPPTX(
  deck: Deck,
  visuals: ReadonlyMap<string, Visual>,
  getSvg: (visualId: string) => SVGSVGElement | null,
): Promise<Blob | null> {
  try {
    const specs = buildDeckSpecs(deck, visuals);
    const geometry = deckGeometry(deck.slideFormat);

    const pptx = new PptxGenJS();
    pptx.layout = geometry.pptxLayout;

    for (const slideSpec of specs) {
      const slide = pptx.addSlide();
      slide.background = slideSpec.backgroundImage
        ? slideSpec.backgroundImage.startsWith("data:")
          ? { data: slideSpec.backgroundImage }
          : { path: slideSpec.backgroundImage }
        : { color: slideSpec.background };
      for (const op of slideSpec.ops) {
        await applyDeckOp(slide, op, getSvg);
      }
    }

    const arrayBuffer = (await pptx.write({
      outputType: "arraybuffer",
    })) as ArrayBuffer;

    return new Blob([arrayBuffer], { type: PPTX_MIME });
  } catch {
    return null;
  }
}

export type DeckSlideImageFormat = "svg" | "png";

export interface DeckSlideImageExportOptions {
  /**
   * Output format for each slide inside the returned ZIP archive.
   * Defaults to `"svg"` for maximum fidelity.
   */
  format?: DeckSlideImageFormat;
  /**
   * Raster scale multiplier when `format === "png"`.
   * Defaults to `1` because the exported slide SVG is already high resolution.
   */
  scale?: number;
}

interface SlideImageGeometry {
  width: number;
  height: number;
  pxPerIn: number;
}

const SLIDE_IMAGE_PX_PER_IN = 120;

function slideImageGeometry(format: Deck["slideFormat"]): SlideImageGeometry {
  const geometry = deckGeometry(format);
  return {
    width: Math.round(geometry.slideW * SLIDE_IMAGE_PX_PER_IN),
    height: Math.round(geometry.slideH * SLIDE_IMAGE_PX_PER_IN),
    pxPerIn: SLIDE_IMAGE_PX_PER_IN,
  };
}

function px(valueInches: number, pxPerIn: number): string {
  return (Math.round(valueInches * pxPerIn * 1000) / 1000).toString();
}

function pxFromPt(valuePt: number, pxPerIn: number): string {
  return (Math.round(((valuePt * pxPerIn) / 72) * 1000) / 1000).toString();
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cssText(value: string | undefined): string {
  return value ? xmlEscape(value) : "";
}

function cssFontFace(fontFace: string | undefined): string {
  return fontFace ? `font-family:${cssText(fontFace)};` : "";
}

function shadowCss(enabled: boolean | undefined): string {
  return enabled ? "filter:drop-shadow(0px 4px 8px rgba(0,0,0,0.28));" : "";
}

function rotationTransform(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number | undefined,
): string {
  if (!rotation) return "";
  const cx = x + w / 2;
  const cy = y + h / 2;
  return ` transform="rotate(${rotation} ${cx} ${cy})"`;
}

function textHtml(text: string, runs?: TextRun[]): string {
  if (runs && runs.length > 0) {
    return runs
      .map((run) => {
        if (run.text === "\n") return "<br/>";
        const styles = [
          run.bold ? "font-weight:700;" : "",
          run.italic ? "font-style:italic;" : "",
          run.code ? `font-family:${CODE_FONT_FACE};` : "",
          run.color ? `color:#${toHex(run.color)};` : "",
        ].join("");
        const content = xmlEscape(run.text).replaceAll("\n", "<br/>");
        const span = `<span style="${styles}">${content}</span>`;
        return run.link
          ? `<a href="${xmlEscape(run.link)}" style="color:inherit;text-decoration:inherit;">${span}</a>`
          : span;
      })
      .join("");
  }
  return xmlEscape(text).replaceAll("\n", "<br/>");
}

function renderTextForeignObject(
  op: Pick<
    DeckTextOp,
    | "x"
    | "y"
    | "w"
    | "h"
    | "text"
    | "runs"
    | "color"
    | "fontSize"
    | "fontFace"
    | "bold"
    | "italic"
    | "underline"
    | "align"
    | "verticalAlign"
    | "lineHeight"
    | "opacity"
    | "shadow"
    | "rotation"
  >,
  pxPerIn: number,
): string {
  const x = px(op.x, pxPerIn);
  const y = px(op.y, pxPerIn);
  const w = px(op.w, pxPerIn);
  const h = px(op.h, pxPerIn);
  const valign =
    op.verticalAlign === "top"
      ? "flex-start"
      : op.verticalAlign === "bottom"
        ? "flex-end"
        : "center";
  const outerStyle = [
    "width:100%;height:100%;display:flex;",
    `align-items:${valign};`,
    "justify-content:stretch;",
    `color:#${op.color};`,
    `font-size:${pxFromPt(op.fontSize, pxPerIn)}px;`,
    op.bold ? "font-weight:700;" : "font-weight:400;",
    op.italic ? "font-style:italic;" : "font-style:normal;",
    op.underline ? "text-decoration:underline;" : "",
    `text-align:${op.align};`,
    `line-height:${op.lineHeight ?? 1.15};`,
    "white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;",
    "overflow:hidden;",
    cssFontFace(op.fontFace),
    op.opacity !== undefined ? `opacity:${op.opacity};` : "",
    shadowCss(op.shadow),
  ].join("");
  const innerStyle = "width:100%;";
  return `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"${rotationTransform(
    op.x * pxPerIn,
    op.y * pxPerIn,
    op.w * pxPerIn,
    op.h * pxPerIn,
    op.rotation,
  )}><div xmlns="http://www.w3.org/1999/xhtml" style="${outerStyle}"><div style="${innerStyle}">${textHtml(
    op.text,
    op.runs,
  )}</div></div></foreignObject>`;
}

function renderBulletsForeignObject(
  op: DeckBulletsOp,
  pxPerIn: number,
): string {
  const bulletCounters = new Map<number, number>();
  const rows = op.items
    .map((item, index) => {
      const detail = op.itemDetails?.[index];
      const indent = detail?.indent ?? 0;
      const numbered = detail?.listType === "number";
      const current = (bulletCounters.get(indent) ?? 0) + 1;
      bulletCounters.set(indent, current);
      if (!numbered) bulletCounters.delete(indent + 1);
      const marker = numbered ? `${current}.` : "•";
      const html = textHtml(item, op.itemRuns?.[index]);
      return `<div style="display:flex;gap:0.5em;padding-left:${indent * 1.5}em;"><span style="width:1.2em;flex:0 0 1.2em;">${marker}</span><span style="flex:1 1 auto;">${html}</span></div>`;
    })
    .join("");
  return renderTextForeignObject(
    {
      ...op,
      text: "",
      runs: undefined,
      shadow: op.shadow,
    },
    pxPerIn,
  ).replace(
    "</div></div></foreignObject>",
    `${rows}</div></div></foreignObject>`,
  );
}

function renderShapeLabel(op: DeckShapeOp, pxPerIn: number): string {
  if (!op.text || op.shape === "line") return "";
  return renderTextForeignObject(
    {
      x: op.x + op.w * 0.08,
      y: op.y + op.h * 0.08,
      w: op.w * 0.84,
      h: op.h * 0.84,
      text: op.text,
      runs: op.textRuns,
      color: op.textColor ?? "18181B",
      fontSize: op.fontSize ?? 18,
      fontFace: op.fontFace,
      bold: op.bold ?? false,
      italic: op.italic ?? false,
      underline: op.underline,
      align: op.align ?? "center",
      verticalAlign: "middle",
      opacity: op.opacity,
      shadow: false,
      rotation: undefined,
      lineHeight: undefined,
    },
    pxPerIn,
  );
}

function renderShapeSvg(op: DeckShapeOp, pxPerIn: number): string {
  const x = op.x * pxPerIn;
  const y = op.y * pxPerIn;
  const w = op.w * pxPerIn;
  const h = op.h * pxPerIn;
  const fillOpacity = op.opacity ?? 1;
  const lineWidth = op.stroke ? Number(pxFromPt(op.stroke.width, pxPerIn)) : 0;
  const dash = op.stroke?.dash
    ? ` stroke-dasharray="${lineWidth * 3} ${lineWidth * 2}"`
    : "";
  const common = `fill="#${op.color}" fill-opacity="${fillOpacity}" stroke="#${op.stroke?.color ?? op.color}" stroke-width="${lineWidth}"${dash}`;
  const transform = rotationTransform(x, y, w, h, op.rotation);
  const groupStyle = shadowCss(op.shadow);
  let shapeSvg = "";

  switch (op.shape) {
    case "ellipse":
      shapeSvg = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common} />`;
      break;
    case "triangle":
      shapeSvg = `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" ${common} />`;
      break;
    case "line":
      shapeSvg = `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#${op.stroke?.color ?? op.color}" stroke-width="${lineWidth || 1}" stroke-opacity="${fillOpacity}"${dash} />`;
      break;
    default:
      shapeSvg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${op.radius ? op.radius * pxPerIn : 0}" ry="${op.radius ? op.radius * pxPerIn : 0}" ${common} />`;
      break;
  }

  return `<g${transform}${groupStyle ? ` style="${groupStyle}"` : ""}>${shapeSvg}${renderShapeLabel(
    op,
    pxPerIn,
  )}</g>`;
}

function renderImageSvg(
  op: DeckImageOp | DeckVisualFallbackOp,
  id: string,
  href: string,
  pxPerIn: number,
): { defs: string[]; body: string } {
  const x = op.x * pxPerIn;
  const y = op.y * pxPerIn;
  const w = op.w * pxPerIn;
  const h = op.h * pxPerIn;
  const defs: string[] = [];
  let clip = "";
  if ("radius" in op && op.radius) {
    const clipId = `${id}-clip`;
    defs.push(
      `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${op.radius * pxPerIn}" ry="${op.radius * pxPerIn}" /></clipPath>`,
    );
    clip = ` clip-path="url(#${clipId})"`;
  }
  const preserveAspectRatio =
    "fitMode" in op && op.fitMode === "cover"
      ? "xMidYMid slice"
      : "xMidYMid meet";
  const style = [
    op.opacity !== undefined ? `opacity:${op.opacity};` : "",
    shadowCss(op.shadow),
  ].join("");
  return {
    defs,
    body: `<image href="${xmlEscape(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${preserveAspectRatio}"${clip}${style ? ` style="${style}"` : ""}${rotationTransform(
      x,
      y,
      w,
      h,
      op.rotation,
    )} />`,
  };
}

function renderConnectorSvg(
  op: DeckConnectorOp,
  id: string,
  pxPerIn: number,
): { defs: string[]; body: string } {
  const defs: string[] = [];
  const x1 = op.x1 * pxPerIn;
  const y1 = op.y1 * pxPerIn;
  const x2 = op.x2 * pxPerIn;
  const y2 = op.y2 * pxPerIn;
  const strokeWidth = Number(pxFromPt(op.width, pxPerIn));
  const markers: string[] = [];
  let markerStart = "";
  let markerEnd = "";

  if (op.arrowStart && op.arrowStart !== "none") {
    const markerId = `${id}-start`;
    defs.push(
      `<marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="${op.arrowStart === "filled" ? `#${op.color}` : "none"}" stroke="#${op.color}" stroke-width="1.2" /></marker>`,
    );
    markerStart = ` marker-start="url(#${markerId})"`;
  }
  if (op.arrowEnd && op.arrowEnd !== "none") {
    const markerId = `${id}-end`;
    defs.push(
      `<marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${op.arrowEnd === "filled" ? `#${op.color}` : "none"}" stroke="#${op.color}" stroke-width="1.2" /></marker>`,
    );
    markerEnd = ` marker-end="url(#${markerId})"`;
  }
  if (markers.length > 0) defs.push(...markers);

  return {
    defs,
    body: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#${op.color}" stroke-width="${strokeWidth}" stroke-linecap="round"${op.dash ? ` stroke-dasharray="${strokeWidth * 3} ${strokeWidth * 2}"` : ""}${op.opacity !== undefined ? ` stroke-opacity="${op.opacity}"` : ""}${markerStart}${markerEnd} />`,
  };
}

function renderPptxSpecSvg(
  spec: PptxSpec,
  id: string,
  pxPerIn: number,
): { defs: string[]; body: string } {
  switch (spec.kind) {
    case "rect":
      return {
        defs: [],
        body: `<rect x="${px(spec.x, pxPerIn)}" y="${px(spec.y, pxPerIn)}" width="${px(spec.w, pxPerIn)}" height="${px(spec.h, pxPerIn)}" rx="${spec.cornerRadius ? px(spec.cornerRadius, pxPerIn) : 0}" ry="${spec.cornerRadius ? px(spec.cornerRadius, pxPerIn) : 0}" fill="#${spec.fill}"${spec.fillTransparency !== undefined ? ` fill-opacity="${(100 - spec.fillTransparency) / 100}"` : ""} stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    case "ellipse":
      return {
        defs: [],
        body: `<ellipse cx="${Number(px(spec.x, pxPerIn)) + Number(px(spec.w, pxPerIn)) / 2}" cy="${Number(px(spec.y, pxPerIn)) + Number(px(spec.h, pxPerIn)) / 2}" rx="${Number(px(spec.w, pxPerIn)) / 2}" ry="${Number(px(spec.h, pxPerIn)) / 2}" fill="#${spec.fill}"${spec.fillTransparency !== undefined ? ` fill-opacity="${(100 - spec.fillTransparency) / 100}"` : ""} stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    case "diamond": {
      const x = spec.x * pxPerIn;
      const y = spec.y * pxPerIn;
      const w = spec.w * pxPerIn;
      const h = spec.h * pxPerIn;
      return {
        defs: [],
        body: `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="#${spec.fill}" stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    }
    case "hexagon": {
      const x = spec.x * pxPerIn;
      const y = spec.y * pxPerIn;
      const w = spec.w * pxPerIn;
      const h = spec.h * pxPerIn;
      const inset = w * 0.25;
      return {
        defs: [],
        body: `<polygon points="${x + inset},${y} ${x + w - inset},${y} ${x + w},${y + h / 2} ${x + w - inset},${y + h} ${x + inset},${y + h} ${x},${y + h / 2}" fill="#${spec.fill}" stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    }
    case "line":
      return renderConnectorSvg(
        {
          kind: "connector",
          x1: spec.x1,
          y1: spec.y1,
          x2: spec.x2,
          y2: spec.y2,
          color: spec.color,
          width: spec.strokeWidth,
          ...(spec.arrowEnd ? { arrowEnd: "arrow" as const } : {}),
          ...(spec.dashed ? { dash: true } : {}),
        },
        id,
        pxPerIn,
      );
    case "text":
      return {
        defs: [],
        body: renderTextForeignObject(
          {
            x: spec.x,
            y: spec.y,
            w: spec.w,
            h: spec.h,
            text: spec.text,
            color: spec.color,
            fontSize: spec.fontSize,
            fontFace: spec.fontFace,
            bold: spec.bold ?? false,
            italic: false,
            align: spec.align ?? "center",
            verticalAlign: "middle",
          },
          pxPerIn,
        ),
      };
    case "image-fallback":
      return { defs: [], body: "" };
  }
}

function slideSpecToSvgString(
  slideSpec: DeckSlideSpec,
  geometry: SlideImageGeometry,
  getSvg: (visualId: string) => SVGSVGElement | null,
): string {
  const defs: string[] = [];
  const body: string[] = [];

  body.push(
    `<rect x="0" y="0" width="${geometry.width}" height="${geometry.height}" fill="#${slideSpec.background}" />`,
  );

  if (slideSpec.backgroundImage) {
    body.push(
      `<image href="${xmlEscape(slideSpec.backgroundImage)}" x="0" y="0" width="${geometry.width}" height="${geometry.height}" preserveAspectRatio="xMidYMid slice" />`,
    );
  }

  slideSpec.ops.forEach((op, index) => {
    const id = `slide-${slideSpec.index}-${index}`;
    switch (op.kind) {
      case "text":
        body.push(renderTextForeignObject(op, geometry.pxPerIn));
        break;
      case "bullets":
        body.push(renderBulletsForeignObject(op, geometry.pxPerIn));
        break;
      case "shape":
        body.push(renderShapeSvg(op, geometry.pxPerIn));
        break;
      case "image": {
        const rendered = renderImageSvg(op, id, op.src, geometry.pxPerIn);
        defs.push(...rendered.defs);
        body.push(rendered.body);
        break;
      }
      case "connector": {
        const rendered = renderConnectorSvg(op, id, geometry.pxPerIn);
        defs.push(...rendered.defs);
        body.push(rendered.body);
        break;
      }
      case "visual-native":
        op.specs.forEach((spec, specIndex) => {
          const rendered = renderPptxSpecSvg(
            spec,
            `${id}-native-${specIndex}`,
            geometry.pxPerIn,
          );
          defs.push(...rendered.defs);
          body.push(rendered.body);
        });
        break;
      case "visual-fallback": {
        const svg = getSvg(op.visualId);
        if (!svg) break;
        const viewBox =
          svg.getAttribute("viewBox") ??
          `0 0 ${svg.viewBox.baseVal.width} ${svg.viewBox.baseVal.height}`;
        const inner = new XMLSerializer()
          .serializeToString(svg)
          .replace(/^<svg\b[^>]*>/i, "")
          .replace(/<\/svg>\s*$/i, "");
        const rendered = renderImageSvg(op, id, "", geometry.pxPerIn);
        defs.push(...rendered.defs);
        body.push(
          `<svg x="${px(op.x, geometry.pxPerIn)}" y="${px(op.y, geometry.pxPerIn)}" width="${px(op.w, geometry.pxPerIn)}" height="${px(op.h, geometry.pxPerIn)}" viewBox="${xmlEscape(viewBox)}" preserveAspectRatio="xMidYMid meet"${
            op.opacity !== undefined || op.shadow || op.rotation
              ? `${rotationTransform(
                  op.x * geometry.pxPerIn,
                  op.y * geometry.pxPerIn,
                  op.w * geometry.pxPerIn,
                  op.h * geometry.pxPerIn,
                  op.rotation,
                )}${
                  op.shadow || op.opacity !== undefined
                    ? ` style="${[
                        op.opacity !== undefined
                          ? `opacity:${op.opacity};`
                          : "",
                        shadowCss(op.shadow),
                      ].join("")}"`
                    : ""
                }`
              : ""
          }>${inner}</svg>`,
        );
        break;
      }
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}" overflow="hidden">
${defs.length > 0 ? `<defs>${defs.join("")}</defs>` : ""}
${body.join("")}
</svg>`;
}

function parseSvg(svgString: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const root = parsed.documentElement;
  return root instanceof SVGSVGElement || root.tagName === "svg"
    ? (root as unknown as SVGSVGElement)
    : null;
}

/**
 * Exports the deck as a ZIP archive containing one image per slide.
 *
 * - `"svg"` preserves the richest fidelity and is the default.
 * - `"png"` rasterizes the generated slide SVG at the requested scale.
 */
export async function exportDeckAsSlideImages(
  deck: Deck,
  visuals: ReadonlyMap<string, Visual>,
  getSvg: (visualId: string) => SVGSVGElement | null,
  options: DeckSlideImageExportOptions = {},
): Promise<Blob | null> {
  try {
    const format = options.format ?? "svg";
    const specs = buildDeckSpecs(deck, visuals);
    const geometry = slideImageGeometry(deck.slideFormat);
    const zip = new JSZip();

    for (const slideSpec of specs) {
      const svgString = slideSpecToSvgString(slideSpec, geometry, getSvg);
      const fileBase = `slide-${String(slideSpec.index + 1).padStart(2, "0")}`;
      if (format === "svg") {
        zip.file(`${fileBase}.svg`, svgString);
        continue;
      }

      const svg = parseSvg(svgString);
      if (!svg) return null;
      const pngBlob = await exportPNG(svg, {
        background: "include",
        colorMode: "color",
        scale: options.scale ?? 1,
      });
      if (!pngBlob) return null;
      zip.file(`${fileBase}.png`, pngBlob);
    }

    return zip.generateAsync({ type: "blob" });
  } catch {
    return null;
  }
}
