/**
 * Pure helpers for @font-face CSS generation (font durable-asset rehydration).
 *
 * `buildFontFaceCss` is free of DOM/browser dependencies so it can be called
 * in Node tests, during SSR, and in React useEffect alike.
 */

/**
 * Builds a `@font-face` CSS rule that binds the CSS font-family name to a
 * durable font asset URL. Returns an empty
 * string when either argument is absent or empty.
 *
 * @param fontFamily  - CSS font-family value, e.g. `'MyFont', sans-serif`
 * @param fontAssetUrl - Protected font asset URL
 */
export function buildFontFaceCss(
  fontFamily: string | null | undefined,
  fontAssetUrl: string | null | undefined,
): string {
  if (!fontFamily || !fontAssetUrl) return "";
  // Extract the bare family name from a CSS font-family stack.
  // e.g. "'MyFont', sans-serif" → "MyFont"
  const bare = fontFamily
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
  if (!bare) return "";
  return `@font-face { font-family: '${bare}'; src: url('${fontAssetUrl}'); font-display: swap; }`;
}

/**
 * Injects a `@font-face` rule into the document `<head>` for a custom-font
 * brand if one is not already present.  No-ops in non-browser environments.
 *
 * Used for rehydration: call this whenever a saved brand with a custom font
 * is rendered or applied, not just right after upload.
 *
 * @param brandId     - Unique brand id used to key the injected style element
 * @param fontFamily  - CSS font-family from the brand (can be null)
 * @param fontAssetUrl - Protected font asset URL derived from the brand asset id
 */
/* @preserve node:coverage ignore next -- Inject behavior is exercised; tsx maps the exported signature line as uncovered. */
export function injectBrandFontFace(
  brandId: string,
  fontFamily: string | null | undefined,
  fontAssetUrl: string | null | undefined,
): void {
  if (typeof document === "undefined") return;
  const css = buildFontFaceCss(fontFamily, fontAssetUrl);
  if (!css) return;
  const id = `brand-font-${brandId}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
