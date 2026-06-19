/**
 * Pure export-options model and SVG transform helpers.
 *
 * These functions are browser-free and fully testable in Node — they operate
 * on plain SVG strings (or minimal DOM-like objects). The canvas/download step
 * lives in export.ts and consumes the transformed strings produced here.
 */

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
