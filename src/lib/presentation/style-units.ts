/**
 * Explicit style unit boundaries shared by renderer and export adapters.
 *
 * Renderer-facing values stay in CSS space (CSS colors/font stacks and
 * slide-relative percentages). Export-facing values are converted at the PPTX
 * boundary to inches and points.
 */

export type CssColor = string;
export type CssFontStack = string;
export type PointSize = number;
export type SlideHeightPercent = number;
export type ExportInches = number;
export type ExportPoints = number;

export const MIN_EXPORT_FONT_SIZE_PT: ExportPoints = 6;

export function slideHeightPctToPoints(
  percentOfHeight: SlideHeightPercent,
  slideHeightPt: PointSize,
  minPt: ExportPoints = MIN_EXPORT_FONT_SIZE_PT,
): ExportPoints {
  return Math.max(minPt, Math.round((percentOfHeight / 100) * slideHeightPt));
}

export function cssFontStackToExportFontFace(
  fontFamily: CssFontStack | undefined,
): string | undefined {
  if (!fontFamily) return undefined;
  const first = fontFamily
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .find((part) => part.length > 0);
  return first && first.toLowerCase() !== "inherit" ? first : undefined;
}
