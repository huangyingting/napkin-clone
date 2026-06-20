/**
 * Pure helpers for @font-face CSS generation (font durable-asset rehydration).
 *
 * `buildFontFaceCss` is free of DOM/browser dependencies so it can be called
 * in Node tests, during SSR, and in React useEffect alike.
 */

/**
 * Builds a `@font-face` CSS rule that binds the CSS font-family name to a
 * durable font asset (a `data:font/...;base64,...` URL).  Returns an empty
 * string when either argument is absent or empty.
 *
 * @param fontFamily  - CSS font-family value, e.g. `'MyFont', sans-serif`
 * @param fontDataUrl - Durable `data:font/...;base64,...` URL
 *
 * @example
 *   buildFontFaceCss("'Acme', sans-serif", "data:font/woff2;base64,...")
 *   // "@font-face { font-family: 'Acme'; src: url('data:font/woff2;base64,...'); font-display: swap; }"
 */
export function buildFontFaceCss(
  fontFamily: string | null | undefined,
  fontDataUrl: string | null | undefined,
): string {
  if (!fontFamily || !fontDataUrl) return "";
  // Extract the bare family name from a CSS font-family stack.
  // e.g. "'MyFont', sans-serif" → "MyFont"
  const bare = fontFamily
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
  if (!bare) return "";
  return `@font-face { font-family: '${bare}'; src: url('${fontDataUrl}'); font-display: swap; }`;
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
 * @param fontDataUrl - Durable font asset data-URL stored on the brand
 */
export function injectBrandFontFace(
  brandId: string,
  fontFamily: string | null | undefined,
  fontDataUrl: string | null | undefined,
): void {
  if (typeof document === "undefined") return;
  const css = buildFontFaceCss(fontFamily, fontDataUrl);
  if (!css) return;
  const id = `brand-font-${brandId}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
