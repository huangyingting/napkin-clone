/**
 * Pure export-options model and SVG transform helpers.
 *
 * These functions are browser-free and fully testable in Node — they operate
 * on plain SVG strings (or minimal DOM-like objects). The canvas/download step
 * lives in export.ts and consumes the transformed strings produced here.
 */

import type { AspectRatioPreset } from "@/lib/visual/schema";

// Re-export for convenience — callers can get both types from one place.
export type { AspectRatioPreset };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How the background of the exported image should be handled. */
export type BackgroundMode = "include" | "transparent" | "custom";

/** Whether colours are exported as-is or converted to greyscale. */
export type ColorMode = "color" | "mono";

/**
 * Named social-media export format. Each maps to a canonical aspect ratio,
 * safe-area padding, background colour, and minimum export scale.
 */
export type SocialPreset = "square" | "portrait" | "landscape" | "story";

/** Full configuration for a social export preset. */
export interface SocialPresetConfig {
  /** Preset identifier. */
  id: SocialPreset;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Canonical pixel dimensions (reference; actual output depends on scale). */
  canonicalWidth: number;
  canonicalHeight: number;
  /** Aspect ratio applied when letterboxing the SVG canvas. */
  aspectRatio: Exclude<AspectRatioPreset, "auto">;
  /**
   * Safe-area padding in SVG canvas units. The content is inset from the
   * canvas edge by this many units on every side.
   */
  padding: number;
  /** Default background fill color as a CSS colour string. */
  background: string;
  /** Minimum export scale recommended for crisp output at the canonical size. */
  minScale: number;
}

/**
 * All four social export presets covering the most common social-media formats.
 * Padding values assume a typical SVG canvas width of ~800 units; they produce
 * ≈ 5–8 % breathing room on each side.
 */
export const SOCIAL_PRESET_CONFIGS: Record<SocialPreset, SocialPresetConfig> = {
  square: {
    id: "square",
    label: "Square 1:1",
    canonicalWidth: 1080,
    canonicalHeight: 1080,
    aspectRatio: "1:1",
    padding: 48,
    background: "#ffffff",
    minScale: 2,
  },
  portrait: {
    id: "portrait",
    label: "Portrait 4:5",
    canonicalWidth: 1080,
    canonicalHeight: 1350,
    aspectRatio: "4:5",
    padding: 48,
    background: "#ffffff",
    minScale: 2,
  },
  landscape: {
    id: "landscape",
    label: "Landscape 16:9",
    canonicalWidth: 1200,
    canonicalHeight: 675,
    aspectRatio: "16:9",
    padding: 36,
    background: "#ffffff",
    minScale: 2,
  },
  story: {
    id: "story",
    label: "Story/Reel 9:16",
    canonicalWidth: 1080,
    canonicalHeight: 1920,
    aspectRatio: "9:16",
    padding: 64,
    background: "#000000",
    minScale: 2,
  },
};

/** Controls applied when producing the exported file. */
export interface ExportOptions {
  /** Background treatment. Defaults to `"include"`. */
  background: BackgroundMode;
  /**
   * When `background === "custom"`, the fill color as a CSS colour string
   * (e.g. `"#ffffff"` or `"rgb(255,255,255)"`).
   */
  customBackground?: string;
  /** Colour conversion. Defaults to `"color"`. */
  colorMode: ColorMode;
  /** Pixel-density multiplier (1 / 2 / 3 …). Defaults to `2`. */
  scale: number;
  /**
   * Aspect-ratio preset. When set (and not `"auto"`), the export canvas is
   * letterboxed/pillarboxed to the requested ratio while the visual content is
   * centred. Defaults to `undefined` / `"auto"` (natural dimensions).
   */
  aspectRatio?: AspectRatioPreset;
  /**
   * Safe-area padding in SVG canvas units. When set, the content is inset from
   * the canvas edge by this many units on every side — ensuring breathing room
   * for social platforms that crop or overlay UI chrome near the edges.
   * Defaults to `0` (no padding).
   */
  padding?: number;
  /**
   * Social export preset selected in the dialog. Drives aspectRatio, padding,
   * background, and minScale. Does not affect the SVG transform directly —
   * use the resolved ExportOptions fields for that.
   */
  socialPreset?: SocialPreset;
  /**
   * When `true`, a "TextIQ" watermark text is stamped in the bottom-right
   * corner of the exported image. Set by the route / export handler based on the
   * user's plan (`!removeWatermark` entitlement). Defaults to `false`.
   */
  watermark?: boolean;
}

/** Sensible defaults — keeps existing callers working unchanged. */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  background: "include",
  colorMode: "color",
  scale: 2,
};

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

export interface ViewBoxLike {
  width: number;
  height: number;
}

/** Returns the pixel dimensions at the requested scale. */
export function computeExportDimensions(
  viewBox: ViewBoxLike,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.round(viewBox.width * scale),
    height: Math.round(viewBox.height * scale),
  };
}

// ---------------------------------------------------------------------------
// Aspect-ratio letterbox helpers
// ---------------------------------------------------------------------------

/** The numeric ratio (width/height) for each named preset. */
export const ASPECT_RATIO_VALUES: Record<
  Exclude<AspectRatioPreset, "auto">,
  number
> = {
  "16:9": 16 / 9,
  "1:1": 1,
  "4:5": 4 / 5,
  "9:16": 9 / 16,
};

/**
 * Computes the letterbox/pillarbox geometry needed to fit a `viewBox` into the
 * requested `preset` aspect ratio, keeping the content at its natural size and
 * centering it within the larger canvas.
 *
 * When `padding` is provided (SVG canvas units), the content is treated as
 * `width + 2*padding` × `height + 2*padding` for the letterbox calculation so
 * the final canvas always has at least `padding` units of breathing room on
 * every side (safe-area padding for social export).
 *
 * Returns the canvas dimensions and the content offset — all in the same units
 * as `viewBox`. For `"auto"` the content fills the canvas (offset = 0).
 */
export function computeLetterboxedDimensions(
  viewBox: ViewBoxLike,
  preset: AspectRatioPreset | undefined,
  padding = 0,
): {
  canvasW: number;
  canvasH: number;
  offsetX: number;
  offsetY: number;
} {
  if (!preset || preset === "auto") {
    return {
      canvasW: viewBox.width,
      canvasH: viewBox.height,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const targetRatio = ASPECT_RATIO_VALUES[preset];
  // Expand the "effective" content size by padding so the letterbox canvas
  // respects the safe-area margin on all sides.
  const effectiveW = viewBox.width + 2 * padding;
  const effectiveH = viewBox.height + 2 * padding;
  const naturalRatio = effectiveW / effectiveH;

  let canvasW: number;
  let canvasH: number;

  if (naturalRatio > targetRatio) {
    // Content is wider than target → pillarbox: extend height
    canvasW = effectiveW;
    canvasH = effectiveW / targetRatio;
  } else if (naturalRatio < targetRatio) {
    // Content is taller than target → letterbox: extend width
    canvasH = effectiveH;
    canvasW = effectiveH * targetRatio;
  } else {
    // Already correct ratio
    canvasW = effectiveW;
    canvasH = effectiveH;
  }

  return {
    canvasW,
    canvasH,
    offsetX: (canvasW - viewBox.width) / 2,
    offsetY: (canvasH - viewBox.height) / 2,
  };
}

/**
 * Apply aspect-ratio letterboxing to a raw SVG string. When `preset` is
 * `"auto"` or `undefined`, the SVG is returned unchanged.
 *
 * Transforms applied:
 * 1. The `viewBox` attribute is expanded to the letterboxed canvas size.
 * 2. A background rect covering the full letterbox area is injected (using the
 *    existing background colour extracted from the SVG, defaulting to white).
 * 3. All existing SVG content is wrapped in a `<g>` that translates it to the
 *    correct centred position within the new canvas.
 *
 * When `padding` is provided (SVG canvas units), the content is inset from the
 * canvas edge by that amount on every side (safe-area padding).
 */
export function applyAspectRatioToSvg(
  svgString: string,
  preset: AspectRatioPreset | undefined,
  padding = 0,
): string {
  if (!preset || preset === "auto") {
    return svgString;
  }

  // Extract viewBox dimensions
  const vbMatch = svgString.match(
    /viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)["']/,
  );
  if (!vbMatch) {
    return svgString;
  }

  const vbX = parseFloat(vbMatch[1]);
  const vbY = parseFloat(vbMatch[2]);
  const vbW = parseFloat(vbMatch[3]);
  const vbH = parseFloat(vbMatch[4]);

  const { canvasW, canvasH, offsetX, offsetY } = computeLetterboxedDimensions(
    { width: vbW, height: vbH },
    preset,
    padding,
  );

  // No change needed when already the correct ratio and no padding
  if (offsetX === 0 && offsetY === 0) {
    return svgString;
  }

  // Try to extract a background fill colour from the first solid-colour rect
  // (the visual background rect that comes right after the opening <svg> tag).
  // Fall back to white when none is found.
  const bgMatch = svgString.match(
    /<rect\b[^>]*\bfill=["']([^"']+)["'][^>]*\bwidth=["'][^"']*["'][^>]*\bheight=["'][^"']*["']/,
  );
  const bgFill = bgMatch ? bgMatch[1] : "#ffffff";

  // Update the viewBox attribute to the new canvas size
  let svg = svgString.replace(
    /viewBox=["']\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+["']/,
    `viewBox="${vbX} ${vbY} ${canvasW} ${canvasH}"`,
  );

  // Wrap all content inside a translate group and prepend the letterbox rect
  svg = svg.replace(
    /(<svg\b[^>]*>)([\s\S]*)(<\/svg>)/,
    (_, open, inner, close) =>
      `${open}` +
      `<rect x="${vbX}" y="${vbY}" width="${canvasW}" height="${canvasH}" fill="${bgFill}" data-letterbox="true"/>` +
      `<g transform="translate(${offsetX},${offsetY})">${inner}</g>` +
      `${close}`,
  );

  return svg;
}

// ---------------------------------------------------------------------------
// SVG string transforms
// ---------------------------------------------------------------------------

/**
 * Build the SVG filter definition string that converts a full-colour graphic
 * to greyscale using a standard luminance matrix.
 */
function buildMonoFilterDef(): string {
  return (
    `<filter id="__export_mono__" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="saturate" values="0"/>` +
    `</filter>`
  );
}

/**
 * Apply {@link ExportOptions} to a raw SVG string and return the transformed
 * string ready for rasterisation or download.
 *
 * Transforms applied (in order):
 * 1. **Transparent background** — removes/strips existing `<rect>` background
 *    fill if found, and ensures no background-colour attribute on the root.
 * 2. **Custom background** — injects a `<rect>` covering the full viewBox with
 *    the requested fill colour *before* all existing children.
 * 3. **Mono colour mode** — injects a greyscale `<filter>` in `<defs>` and
 *    wraps all existing content in a `<g filter="url(#__export_mono__)">`.
 * 4. **Aspect ratio** — letterboxes/pillarboxes the canvas to the requested
 *    ratio by expanding the viewBox and centering the content.
 *
 * All transforms are pure string operations so they work in Node without a DOM.
 */
export function applyExportOptionsToSvg(
  svgString: string,
  options: ExportOptions,
): string {
  let svg = svgString;

  // ── background ────────────────────────────────────────────────────────────
  if (options.background === "transparent") {
    // Strip style="background-color:…" / style="background:…" on root <svg>
    svg = svg.replace(
      /(<svg\b[^>]*)\sstyle="[^"]*background(?:-color)?:[^;"]*;?([^"]*)"/,
      (_, before, rest) => {
        const cleaned = rest.replace(/^\s*;\s*/, "").trim();
        return cleaned ? `${before} style="${cleaned}"` : before;
      },
    );

    // Remove a leading background rect (commonly added by renderers).
    // We match a <rect> that appears to be a backdrop: covers most of the
    // canvas and has no `id` that suggests it is a data shape.
    svg = svg.replace(
      /<rect\b(?=[^>]*\bfill=["'][^"']*["'])(?=[^>]*\bwidth=["'][^"']*["'])(?=[^>]*\bheight=["'][^"']*["'])[^>]*(?:\s+x=["']0["']|\s+y=["']0["'])[^>]*\/?>(?:<\/rect>)?/,
      "",
    );
  } else if (options.background === "custom") {
    const fill = options.customBackground ?? "#ffffff";
    // Inject a full-coverage background rect immediately after the opening <svg …> tag.
    svg = svg.replace(/(<svg\b[^>]*>)/, (_, openTag) => {
      // Extract viewBox dimensions to size the rect correctly
      const vbMatch = openTag.match(
        /viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)["']/,
      );
      const w = vbMatch ? vbMatch[1] : "100%";
      const h = vbMatch ? vbMatch[2] : "100%";
      return (
        `${openTag}` +
        `<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" data-export-bg="true"/>`
      );
    });
  }

  // ── colour mode ───────────────────────────────────────────────────────────
  if (options.colorMode === "mono") {
    const filterDef = buildMonoFilterDef();

    // Ensure a <defs> block exists and inject our filter.
    if (/<defs\b/.test(svg)) {
      svg = svg.replace(/<defs\b([^>]*)>/, `<defs$1>${filterDef}`);
    } else {
      svg = svg.replace(/(<svg\b[^>]*>)/, `$1<defs>${filterDef}</defs>`);
    }

    // Wrap all child content in a filter group.
    // Strategy: replace the first occurrence of "> ... </svg>" with
    // "> <g filter="url(#__export_mono__)"> ... </g> </svg>"
    svg = svg.replace(
      /(<svg\b[^>]*>)([\s\S]*)(<\/svg>)/,
      (_, open, inner, close) =>
        `${open}<g filter="url(#__export_mono__)">${inner}</g>${close}`,
    );
  }

  // ── aspect ratio ─────────────────────────────────────────────────────────
  if (options.aspectRatio && options.aspectRatio !== "auto") {
    svg = applyAspectRatioToSvg(svg, options.aspectRatio, options.padding ?? 0);
  }

  // ── watermark ────────────────────────────────────────────────────────────
  if (options.watermark) {
    svg = applyWatermarkToSvg(svg);
  }

  return svg;
}

/**
 * Inject a "TextIQ" watermark text into the bottom-right corner of the
 * SVG. Uses a semi-transparent text element so it is legible on both light and
 * dark backgrounds. The text is placed relative to the viewBox dimensions so
 * it scales correctly at any export resolution.
 */
export function applyWatermarkToSvg(svgString: string): string {
  const vbMatch = svgString.match(
    /viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)["']/,
  );
  if (!vbMatch) return svgString;

  const vbW = parseFloat(vbMatch[3]);
  const vbH = parseFloat(vbMatch[4]);
  const fontSize = Math.max(8, Math.round(vbH * 0.035));
  const padding = Math.round(fontSize * 0.8);
  const x = vbW - padding;
  const y = vbH - padding;

  const watermarkEl =
    `<text ` +
    `x="${x}" y="${y}" ` +
    `text-anchor="end" ` +
    `font-family="sans-serif" ` +
    `font-size="${fontSize}" ` +
    `fill="rgba(100,100,100,0.45)" ` +
    `data-watermark="true" ` +
    `style="pointer-events:none;user-select:none;"` +
    `>TextIQ</text>`;

  return svgString.replace(/(<\/svg>)$/, `${watermarkEl}$1`);
}

// ---------------------------------------------------------------------------
// Social preset helpers
// ---------------------------------------------------------------------------

/**
 * Merges a {@link SocialPreset} configuration into existing {@link ExportOptions},
 * returning a new options object ready for the export pipeline.
 *
 * Rules applied:
 * - `aspectRatio` and `padding` are taken from the preset config.
 * - `background` is forced to `"custom"` with the preset's fill color.
 * - `scale` is raised to the preset's `minScale` if the current value is lower.
 * - `socialPreset` is recorded so the dialog can reflect the active preset.
 * - All other options (colorMode, watermark, …) are preserved from `current`.
 */
export function applySocialPresetToOptions(
  preset: SocialPreset,
  current: ExportOptions,
): ExportOptions {
  const config = SOCIAL_PRESET_CONFIGS[preset];
  return {
    ...current,
    socialPreset: preset,
    aspectRatio: config.aspectRatio,
    padding: config.padding,
    background: "custom",
    customBackground: config.background,
    scale: Math.max(current.scale, config.minScale),
  };
}

/**
 * Clears the active social preset, restoring natural-dimensions export.
 * Resets `aspectRatio`, `padding`, and `socialPreset`; keeps everything else.
 */
export function clearSocialPreset(current: ExportOptions): ExportOptions {
  const next: ExportOptions = { ...current };
  delete next.socialPreset;
  delete next.padding;
  delete next.aspectRatio;
  return next;
}

/**
 * A lightweight utility that serialises an `SVGSVGElement` and applies
 * {@link ExportOptions}. This is the main entry-point for browser-side callers
 * (export.ts) — it couples the DOM serialization to the pure string transform.
 */
export function buildTransformedSvgString(
  svgElement: SVGSVGElement,
  options: ExportOptions,
): string {
  const serializer = new XMLSerializer();
  const raw = serializer.serializeToString(svgElement);
  return applyExportOptionsToSvg(raw, options);
}
