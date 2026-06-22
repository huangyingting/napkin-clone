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
 *     `DeckSlideSpec` descriptors. Fully testable under `node --test`. It reuses
 *     `materializeSlideElements` so legacy slides (no `elements[]`) and free-form
 *     slides flow through one uniform element-based code path, and reuses
 *     `visualToNativeSpecs` for the visual→PPTX mapping.
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

import PptxGenJS from "pptxgenjs";

import type {
  Deck,
  DeckTheme,
  ElementAlign,
  ElementBox,
  ShapeKind,
  Slide,
  TextRun,
} from "@/lib/presentation/deck";
import {
  lineBoxFromEndpoints,
  resolveConnectorElementPoints,
  resolveConnectorEndpoint,
} from "@/lib/presentation/connector-geometry";
import { materializeSlideElements } from "@/lib/presentation/deck";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";
import { slideFormatConfig } from "@/lib/presentation/slide-format";
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
// Theme colors — DOM-free copy of DECK_THEMES (slide-canvas.tsx). Kept local so
// this module stays importable under `node --test` without pulling in React.
// ---------------------------------------------------------------------------

interface ThemeColors {
  bg: string;
  accent: string;
  title: string;
  body: string;
}

const THEME_COLORS: Record<DeckTheme, ThemeColors> = {
  indigo: {
    bg: "#1e1b4b",
    accent: "#818cf8",
    title: "#e0e7ff",
    body: "#c7d2fe",
  },
  ocean: {
    bg: "#0c1a2e",
    accent: "#38bdf8",
    title: "#e0f2fe",
    body: "#bae6fd",
  },
  forest: {
    bg: "#052e16",
    accent: "#4ade80",
    title: "#dcfce7",
    body: "#bbf7d0",
  },
  sunset: {
    bg: "#431407",
    accent: "#fb923c",
    title: "#ffedd5",
    body: "#fed7aa",
  },
  grape: {
    bg: "#2e1065",
    accent: "#c084fc",
    title: "#f3e8ff",
    body: "#e9d5ff",
  },
  default: {
    bg: "#09090b",
    accent: "#a1a1aa",
    title: "#fafafa",
    body: "#d4d4d8",
  },
};

function themeColors(theme: DeckTheme | undefined): ThemeColors {
  return (theme && THEME_COLORS[theme]) || THEME_COLORS.default;
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
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  align: ElementAlign;
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
  color: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: ElementAlign;
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
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: ElementAlign;
  /** Optional border/line stroke; `width` already converted to points. */
  stroke?: { color: string; width: number };
  /** Optional rect corner radius, already converted to inches. */
  radius?: number;
}

/** A raster image (data URL or path) placed at an inch box. */
export interface DeckImageOp extends InchBox {
  kind: "image";
  src: string;
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
 * Both free-form slides (those with `elements[]`) and legacy slides flow through
 * `materializeSlideElements`, so a legacy slide is emitted as its title + bullets
 * + visual, while a free-form slide is emitted exactly as authored.
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
    buildSlideSpec(slide, index, deck.theme, visuals, geometry),
  );
}

function buildSlideSpec(
  slide: Slide,
  index: number,
  deckTheme: DeckTheme,
  visuals: ReadonlyMap<string, Visual>,
  geometry: DeckGeometry,
): DeckSlideSpec {
  const colors = themeColors(slide.theme ?? deckTheme);
  const background = toHex(
    slide.background ?? slide.backgroundGradient?.from ?? colors.bg,
  );
  const accent = toHex(slide.accent ?? colors.accent);

  const elements = [...materializeSlideElements(slide)].sort(
    (a, b) => a.zIndex - b.zIndex,
  );

  const ops: DeckOp[] = [];

  for (const element of elements) {
    let elementBox = element.box;
    let elementRotation = element.rotation;
    if (element.kind === "shape" && element.shape === "line") {
      const start = resolveConnectorEndpoint(
        element.connector?.start,
        elements,
        (candidate) => candidate.box,
      );
      const end = resolveConnectorEndpoint(
        element.connector?.end,
        elements,
        (candidate) => candidate.box,
      );
      if (start && end) {
        const resolved = lineBoxFromEndpoints(
          start,
          end,
          element.box.h,
          geometry.slideW / geometry.slideH,
        );
        elementBox = resolved.box;
        elementRotation = resolved.rotation;
      }
    }
    const box = boxToInches(elementBox, geometry);
    if (elementRotation) {
      box.rotation = elementRotation;
    }
    if (element.shadow) {
      box.shadow = true;
    }

    switch (element.kind) {
      case "text": {
        const defaultColor =
          element.role === "title" ? colors.title : colors.body;
        ops.push({
          kind: "text",
          ...box,
          text: element.text,
          ...(element.runs && element.runs.length > 0
            ? { runs: element.runs }
            : {}),
          color: toHex(element.style.color ?? defaultColor),
          fontSize: fontSizePt(element.style.fontSize, geometry),
          bold: element.style.bold,
          italic: element.style.italic,
          ...(element.style.underline ? { underline: true } : {}),
          align: element.style.align,
        });
        break;
      }
      case "bullets": {
        ops.push({
          kind: "bullets",
          ...box,
          items: [...element.bullets],
          ...(element.bulletRuns && element.bulletRuns.length > 0
            ? { itemRuns: element.bulletRuns }
            : {}),
          color: toHex(element.style.color ?? colors.body),
          fontSize: fontSizePt(element.style.fontSize, geometry),
          bold: element.style.bold,
          italic: element.style.italic,
          ...(element.style.underline ? { underline: true } : {}),
          align: element.style.align,
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
                textColor: toHex(element.textStyle?.color ?? colors.body),
                fontSize: fontSizePt(
                  element.textStyle?.fontSize ?? 4,
                  geometry,
                ),
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
        ops.push({ kind: "image", ...box, src: element.src });
        break;
      }
      case "visual": {
        const visual = visuals.get(element.visualId);
        if (!visual) break;
        // Honor the optional per-element restyle, mirroring the shared renderer
        // (slide-canvas VisualElementView) so the export matches what the editor
        // and present/public viewers draw. applyTheme is pure and node-safe.
        const styled = element.styleThemeId
          ? applyTheme(visual, element.styleThemeId)
          : visual;
        const layout = layoutWithinBox(styled, box);
        const specs = visualToNativeSpecs(styled, layout);
        if (isImageFallback(specs)) {
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
        const strokeColor = element.stroke?.color ?? "#a1a1aa";
        // Width is authored in `cqmin` (percent of shortest slide side); convert to pt.
        const minInch = Math.min(geometry.slideW, geometry.slideH);
        const strokeWidthPt = Math.max(
          1,
          ((element.stroke?.width ?? 0.4) / 100) * minInch * 72,
        );
        ops.push({
          kind: "connector",
          x1: (startPct.x / 100) * geometry.slideW,
          y1: (startPct.y / 100) * geometry.slideH,
          x2: (endPct.x / 100) * geometry.slideW,
          y2: (endPct.y / 100) * geometry.slideH,
          color: toHex(strokeColor),
          width: strokeWidthPt,
          ...(element.dash ? { dash: true } : {}),
          ...(element.arrowStart ? { arrowStart: element.arrowStart } : {}),
          ...(element.arrowEnd ? { arrowEnd: element.arrowEnd } : {}),
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
  const shared = {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    color: op.color,
    fontSize: op.fontSize,
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    valign: "middle" as const,
    wrap: true,
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.underline ? { underline: { style: "sng" as const } } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
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
  const shared = {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    color: op.color,
    fontSize: op.fontSize,
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    valign: "middle" as const,
    wrap: true,
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.underline ? { underline: { style: "sng" as const } } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
  };

  const hasRuns =
    op.itemRuns !== undefined &&
    op.itemRuns.some((runs) => runs && runs.length > 0);

  if (!hasRuns) {
    const runs = op.items.map((text, i) => ({
      text,
      options: { bullet: true, breakLine: i < op.items.length - 1 },
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
            ...(j === 0 ? { bullet: true } : {}),
            ...(isLastRun && !isLastLine ? { breakLine: true } : {}),
          },
        });
      });
    } else {
      runs.push({
        text,
        options: { bullet: true, breakLine: !isLastLine },
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
    bold: op.bold ?? false,
    italic: op.italic ?? false,
    ...(op.underline ? { underline: true } : {}),
    align: op.align ?? "center",
  });
}

function applyShapeOp(slide: PptxSlide, op: DeckShapeOp): void {
  const rotate = op.rotation ? { rotate: op.rotation } : {};
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
      fill: { color: op.color },
      line: { width: 0, color: op.color },
      ...rotate,
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
    fill: { color: op.color },
    line: op.stroke
      ? { color: op.stroke.color, width: op.stroke.width }
      : { width: 0, color: op.color },
    ...(op.radius && op.shape !== "ellipse" ? { rectRadius: op.radius } : {}),
    ...rotate,
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
  });
  applyShapeTextOp(slide, op);
}

function applyImageOp(slide: PptxSlide, op: DeckImageOp): void {
  const source = op.src.startsWith("data:")
    ? { data: op.src }
    : { path: op.src };
  slide.addImage({
    ...source,
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    ...(op.rotation ? { rotate: op.rotation } : {}),
    ...(op.shadow ? { shadow: SHADOW_OPTS } : {}),
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
    },
    rotate: angle,
    ...(op.opacity !== undefined
      ? { transparency: Math.round((1 - op.opacity) * 100) }
      : {}),
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
      applyImageOp(slide, op);
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
