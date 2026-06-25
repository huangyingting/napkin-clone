/**
 * Pure infographic layout engine.
 *
 * Given a list of DocumentBlocks and an InfographicConfig, computes the
 * y-offset and height for every block plus the total canvas height. No DOM,
 * canvas, or browser APIs are used — the function is fully testable under
 * `node --test`.
 *
 * The rasterisation layer (`exportDocumentAsInfographic` in document-export.ts)
 * consumes this output and draws each block onto an HTML Canvas.
 */

import type { DocumentBlock } from "@/lib/content";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Complete layout + typography configuration for an infographic export. */
export interface InfographicConfig {
  /** Output canvas width in CSS pixels (e.g. 1080). */
  width: number;
  /** Horizontal padding on each side, in px. */
  paddingX: number;
  /** Top and bottom padding, in px. */
  paddingY: number;
  /** Vertical gap between consecutive blocks, in px. */
  gap: number;

  /** Font sizes in px. */
  fontH1: number;
  fontH2: number;
  fontH3: number;
  fontBody: number;

  /** Line-height multiplier (unitless, applied to font size). */
  lineHeight: number;

  /**
   * Extra top margin inserted before every heading block (except the very
   * first block in the document), in px.
   */
  headingTopMargin: number;

  /**
   * Per-visual dimensions map (visualId → { width, height }).
   * When supplied, the actual SVG viewBox aspect ratio is used to size the
   * block. Keys are the `visualId` strings from the document blocks.
   */
  visualDimensions?: Record<string, { width: number; height: number }>;

  /**
   * Fallback height (px) for visual blocks whose dimensions are absent from
   * `visualDimensions`. When omitted, defaults to `contentWidth * (9/16)`.
   */
  visualDefaultHeight?: number;

  /**
   * Canvas background colour (CSS colour string). Stored here so the config
   * is self-contained; consumed by the rasteriser.
   * @default "#ffffff"
   */
  background?: string;

  /**
   * Primary text colour (CSS colour string). Consumed by the rasteriser.
   * @default "#15171a"
   */
  textColor?: string;

  /**
   * Heading / accent colour (CSS colour string). Consumed by the rasteriser.
   * @default "#1a1a2e"
   */
  headingColor?: string;

  /**
   * Quote / muted text colour (CSS colour string). Consumed by the rasteriser.
   * @default "#54666d"
   */
  mutedColor?: string;
}

/** Sensible defaults that produce a crisp 1080-px-wide social infographic. */
export const DEFAULT_INFOGRAPHIC_CONFIG: InfographicConfig = {
  width: 1080,
  paddingX: 80,
  paddingY: 64,
  gap: 24,
  fontH1: 52,
  fontH2: 40,
  fontH3: 30,
  fontBody: 24,
  lineHeight: 1.5,
  headingTopMargin: 32,
  background: "#ffffff",
  textColor: "#15171a",
  headingColor: "#1a1a2e",
  mutedColor: "#54666d",
};

// ---------------------------------------------------------------------------
// Width presets
// ---------------------------------------------------------------------------

/** Named infographic width presets. */
export type InfographicWidthPreset = "1080" | "800" | "1200";

/** Human labels and pixel widths for each preset. */
export const INFOGRAPHIC_WIDTH_PRESETS: Record<
  InfographicWidthPreset,
  { label: string; width: number }
> = {
  "1080": { label: "Social (1080 px)", width: 1080 },
  "800": { label: "Blog (800 px)", width: 800 },
  "1200": { label: "Wide (1200 px)", width: 1200 },
};

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

/** Layout geometry for a single block. */
interface BlockLayout {
  /** Index of the source block in the original `blocks` array. */
  blockIndex: number;
  /** Y-offset of the block's top edge from the canvas top, in px. */
  y: number;
  /** Block height in px. */
  height: number;
}

/** Result returned by {@link computeInfographicLayout}. */
export interface InfographicLayout {
  /** Layout for each block — same order as the input `blocks` array. */
  blocks: BlockLayout[];
  /** Total canvas height in px (includes paddingY top + bottom). */
  totalHeight: number;
  /**
   * Content-area width (canvas `width` minus `paddingX × 2`).
   * Useful for the rasteriser — saves it from recomputing.
   */
  contentWidth: number;
}

// ---------------------------------------------------------------------------
// Text-height estimation (pure, no DOM)
// ---------------------------------------------------------------------------

/**
 * Estimates the rendered height of a text string in pixels.
 *
 * Uses a fixed average character-width ratio of **0.55 × fontSize** which is
 * accurate to ±15 % for typical sans-serif text at normal weights. This is
 * intentionally an approximation — the rasteriser may render slightly more or
 * fewer lines depending on the actual font metrics, but the layout engine only
 * needs to be close enough that blocks do not catastrophically overlap.
 *
 * Always returns at least one line height so that empty or short blocks still
 * occupy vertical space.
 *
 * @param text          The plain-text content to measure.
 * @param fontSize      Font size in px.
 * @param contentWidth  Available horizontal width in px.
 * @param lineHeight    Unitless line-height multiplier.
 */
export function estimateTextHeight(
  text: string,
  fontSize: number,
  contentWidth: number,
  lineHeight: number,
): number {
  if (contentWidth <= 0 || fontSize <= 0) return fontSize * lineHeight;

  // Average character width for proportional sans-serif (calibrated heuristic)
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.max(1, Math.floor(contentWidth / avgCharWidth));

  // Treat empty text as a single blank line so the block still occupies space.
  const charCount = text.length > 0 ? text.length : 1;
  const lines = Math.max(1, Math.ceil(charCount / charsPerLine));

  return lines * fontSize * lineHeight;
}

// ---------------------------------------------------------------------------
// computeInfographicLayout
// ---------------------------------------------------------------------------

/**
 * Computes the vertical layout of an infographic: for each block the y-offset
 * (from canvas top) and height in pixels; plus the total canvas height.
 *
 * **Pure function** — deterministic, no side effects, no IO.
 *
 * Layout rules:
 * - Canvas begins with `paddingY` pixels of top space.
 * - Blocks are stacked top-to-bottom separated by `gap` pixels.
 * - Heading blocks receive an additional `headingTopMargin` above the `gap`
 *   (except for the very first block).
 * - Visual blocks are sized to `contentWidth` wide; height is derived from
 *   the viewBox aspect ratio (when available) or `visualDefaultHeight`.
 * - A horizontal-rule block (`hr`) is assigned a height of `1` px.
 * - An empty document produces `totalHeight = paddingY * 2`.
 *
 * @param blocks  Document blocks from {@link collectDocumentBlocks}
 * @param config  Layout + typography configuration
 */
export function computeInfographicLayout(
  blocks: DocumentBlock[],
  config: InfographicConfig,
): InfographicLayout {
  const contentWidth = config.width - config.paddingX * 2;
  const blockLayouts: BlockLayout[] = [];

  let curY = config.paddingY; // top padding before first block
  let isFirst = true;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    let blockHeight = 0;
    let extraTopMargin = 0;

    if (block.kind === "visual") {
      const dims = config.visualDimensions?.[block.visualId];
      if (dims && dims.width > 0 && dims.height > 0) {
        // Scale the visual to fill contentWidth, preserving aspect ratio.
        blockHeight = Math.round((contentWidth * dims.height) / dims.width);
      } else if (config.visualDefaultHeight != null) {
        blockHeight = config.visualDefaultHeight;
      } else {
        // Default: 16:9 aspect ratio
        blockHeight = Math.round(contentWidth * (9 / 16));
      }
    } else {
      const { blockType, text, level } = block;

      switch (blockType) {
        case "heading": {
          const fs =
            level === 1
              ? config.fontH1
              : level === 2
                ? config.fontH2
                : config.fontH3;
          blockHeight = estimateTextHeight(
            text,
            fs,
            contentWidth,
            config.lineHeight,
          );
          // Headings (except the first block) get extra breathing room above.
          if (!isFirst) {
            extraTopMargin = config.headingTopMargin;
          }
          break;
        }
        case "quote":
          // Quotes use a reduced effective width (indent on each side).
          blockHeight = estimateTextHeight(
            text,
            config.fontBody,
            Math.max(1, contentWidth - config.paddingX * 0.5),
            config.lineHeight,
          );
          break;
        case "listitem":
          // Bullet indent reduces available width slightly.
          blockHeight = estimateTextHeight(
            text,
            config.fontBody,
            Math.max(1, contentWidth - 32),
            config.lineHeight,
          );
          break;
        case "hr":
          // A thin rule — rasteriser adds vertical margins visually.
          blockHeight = 1;
          break;
        case "paragraph":
        default:
          blockHeight = estimateTextHeight(
            text,
            config.fontBody,
            contentWidth,
            config.lineHeight,
          );
          break;
      }
    }

    // Insert gap + optional heading margin after the very first block.
    if (!isFirst) {
      curY += config.gap + extraTopMargin;
    }

    blockLayouts.push({ blockIndex: i, y: curY, height: blockHeight });
    curY += blockHeight;
    isFirst = false;
  }

  const totalHeight =
    blocks.length === 0 ? config.paddingY * 2 : curY + config.paddingY;

  return { blocks: blockLayouts, contentWidth, totalHeight };
}
