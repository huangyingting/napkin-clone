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
};

/**
 * Computes the letterbox/pillarbox geometry needed to fit a `viewBox` into the
 * requested `preset` aspect ratio, keeping the content at its natural size and
 * centering it within the larger canvas.
 *
 * Returns the canvas dimensions and the content offset — all in the same units
 * as `viewBox`. For `"auto"` the content fills the canvas (offset = 0).
 */
export function computeLetterboxedDimensions(
  viewBox: ViewBoxLike,
  preset: AspectRatioPreset | undefined,
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
  const naturalRatio = viewBox.width / viewBox.height;

  let canvasW: number;
  let canvasH: number;

  if (naturalRatio > targetRatio) {
    // Content is wider than target → pillarbox: extend height
    canvasW = viewBox.width;
    canvasH = viewBox.width / targetRatio;
  } else if (naturalRatio < targetRatio) {
    // Content is taller than target → letterbox: extend width
    canvasH = viewBox.height;
    canvasW = viewBox.height * targetRatio;
  } else {
    // Already correct ratio
    canvasW = viewBox.width;
    canvasH = viewBox.height;
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
 */
export function applyAspectRatioToSvg(
  svgString: string,
  preset: AspectRatioPreset | undefined,
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
  );

  // No change needed when already the correct ratio
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
    svg = applyAspectRatioToSvg(svg, options.aspectRatio);
  }

  return svg;
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
