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
 * Units: the deck is designed as a 16:9 surface with percentage-based element
 * boxes, so we target the PptxGenJS `LAYOUT_WIDE` size (13.333" × 7.5") and
 * convert each percentage box to inches against those dimensions. Font sizes are
 * authored as a percent of slide height (`cqh`) and converted to points against
 * the 7.5" (540 pt) slide height.
 */

import PptxGenJS from "pptxgenjs";

import type {
  Deck,
  DeckTheme,
  ElementAlign,
  ElementBox,
  Slide,
} from "@/lib/presentation/deck";
import { materializeSlideElements } from "@/lib/presentation/deck";
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
// Slide geometry (LAYOUT_WIDE — 16:9)
// ---------------------------------------------------------------------------

const SLIDE_W = 13.333; // inches
const SLIDE_H = 7.5; // inches
const SLIDE_H_PT = SLIDE_H * 72; // 540 pt — used to convert `cqh` font sizes

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
}

/** A run of text (single block) placed at an inch box. */
export interface DeckTextOp extends InchBox {
  kind: "text";
  text: string;
  /** Hex color without leading `#`. */
  color: string;
  /** Font size in points. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: ElementAlign;
}

/** A bulleted list placed at an inch box. */
export interface DeckBulletsOp extends InchBox {
  kind: "bullets";
  items: string[];
  color: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: ElementAlign;
}

/** A primitive shape placed at an inch box. */
export interface DeckShapeOp extends InchBox {
  kind: "shape";
  shape: "rect" | "ellipse" | "line";
  /** Hex color without leading `#`. */
  color: string;
}

/** A raster image (data URL or path) placed at an inch box. */
export interface DeckImageOp extends InchBox {
  kind: "image";
  src: string;
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
  | DeckVisualFallbackOp;

/** One slide's worth of background + ordered draw operations. */
export interface DeckSlideSpec {
  /** Zero-based slide position, preserving `deck.slides` order. */
  index: number;
  /** Slide background — hex color without leading `#`. */
  background: string;
  /** Slide accent — hex color without leading `#`. */
  accent: string;
  /** Draw operations in z-order (earlier = drawn first / underneath). */
  ops: DeckOp[];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Convert a percentage {@link ElementBox} to an inch-space box. */
function boxToInches(box: ElementBox): InchBox {
  return {
    x: (box.x / 100) * SLIDE_W,
    y: (box.y / 100) * SLIDE_H,
    w: (box.w / 100) * SLIDE_W,
    h: (box.h / 100) * SLIDE_H,
  };
}

/** Convert a `cqh` (percent-of-slide-height) font size to points. */
function fontSizePt(percentOfHeight: number): number {
  return Math.max(6, Math.round((percentOfHeight / 100) * SLIDE_H_PT));
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
  return deck.slides.map((slide, index) =>
    buildSlideSpec(slide, index, deck.theme, visuals),
  );
}

function buildSlideSpec(
  slide: Slide,
  index: number,
  deckTheme: DeckTheme,
  visuals: ReadonlyMap<string, Visual>,
): DeckSlideSpec {
  const colors = themeColors(slide.theme ?? deckTheme);
  const background = toHex(slide.background ?? colors.bg);
  const accent = toHex(slide.accent ?? colors.accent);

  const elements = [...materializeSlideElements(slide)].sort(
    (a, b) => a.zIndex - b.zIndex,
  );

  const ops: DeckOp[] = [];

  for (const element of elements) {
    const box = boxToInches(element.box);

    switch (element.kind) {
      case "text": {
        const defaultColor =
          element.role === "title" ? colors.title : colors.body;
        ops.push({
          kind: "text",
          ...box,
          text: element.text,
          color: toHex(element.style.color ?? defaultColor),
          fontSize: fontSizePt(element.style.fontSize),
          bold: element.style.bold,
          italic: element.style.italic,
          align: element.style.align,
        });
        break;
      }
      case "bullets": {
        ops.push({
          kind: "bullets",
          ...box,
          items: [...element.bullets],
          color: toHex(element.style.color ?? colors.body),
          fontSize: fontSizePt(element.style.fontSize),
          bold: element.style.bold,
          italic: element.style.italic,
          align: element.style.align,
        });
        break;
      }
      case "shape": {
        ops.push({
          kind: "shape",
          ...box,
          shape: element.shape,
          color: toHex(element.color),
        });
        break;
      }
      case "image": {
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
    }
  }

  return { index, background, accent, ops };
}

// ---------------------------------------------------------------------------
// Browser-only applier
// ---------------------------------------------------------------------------

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;
type ShapeName = Parameters<PptxSlide["addShape"]>[0];

const SHAPES = {
  rect: "rect",
  ellipse: "ellipse",
  line: "line",
} satisfies Record<DeckShapeOp["shape"], ShapeName>;

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

function applyTextOp(slide: PptxSlide, op: DeckTextOp): void {
  slide.addText(op.text, {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    color: op.color,
    fontSize: op.fontSize,
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    valign: "middle",
    wrap: true,
  });
}

function applyBulletsOp(slide: PptxSlide, op: DeckBulletsOp): void {
  const runs = op.items.map((text, i) => ({
    text,
    options: { bullet: true, breakLine: i < op.items.length - 1 },
  }));
  slide.addText(runs, {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    color: op.color,
    fontSize: op.fontSize,
    bold: op.bold,
    italic: op.italic,
    align: op.align,
    valign: "middle",
    wrap: true,
  });
}

function applyShapeOp(slide: PptxSlide, op: DeckShapeOp): void {
  if (op.shape === "line") {
    // Render as a centered horizontal rule across the box.
    slide.addShape(SHAPES.line, {
      x: op.x,
      y: op.y + op.h / 2,
      w: op.w,
      h: 0,
      line: { color: op.color, width: 2 },
    });
    return;
  }
  slide.addShape(op.shape === "ellipse" ? SHAPES.ellipse : SHAPES.rect, {
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    fill: { color: op.color },
    line: { width: 0, color: op.color },
  });
}

function applyImageOp(slide: PptxSlide, op: DeckImageOp): void {
  const source = op.src.startsWith("data:")
    ? { data: op.src }
    : { path: op.src };
  slide.addImage({ ...source, x: op.x, y: op.y, w: op.w, h: op.h });
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

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";

    for (const slideSpec of specs) {
      const slide = pptx.addSlide();
      slide.background = { color: slideSpec.background };
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
