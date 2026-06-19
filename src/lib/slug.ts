/**
 * Pure, framework-free slug helper. Turns a document title into a URL-safe
 * slug used for readable share URLs.
 *
 * No React / Next imports — safe to run server-side and unit-test under
 * `node --test` + `tsx`.
 */

/** Maximum length of a generated slug (in characters). */
export const MAX_SLUG_LENGTH = 80;

/**
 * Converts a title into a URL-safe slug:
 * - lowercased
 * - accents/diacritics stripped (NFKD normalize + remove combining marks)
 * - non-alphanumeric runs collapsed to a single hyphen
 * - leading/trailing hyphens trimmed
 * - truncated to MAX_SLUG_LENGTH on a hyphen boundary (no trailing hyphen)
 *
 * Returns an empty string when the input has no usable characters.
 */
export function slugify(title: string): string {
  if (typeof title !== "string") {
    return "";
  }

  const base = title
    .normalize("NFKD")
    // strip combining diacritical marks
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // replace any run of non-alphanumeric characters with a single hyphen
    .replace(/[^a-z0-9]+/g, "-")
    // collapse multiple hyphens (defensive; the run-replace already handles most)
    .replace(/-+/g, "-")
    // trim leading/trailing hyphens
    .replace(/^-+|-+$/g, "");

  if (base.length <= MAX_SLUG_LENGTH) {
    return base;
  }

  // Truncate, then trim back to the last full segment so we never end on a hyphen.
  const truncated = base.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  return truncated;
}

/**
 * Builds the URL path segment used in a share/embed link from a (possibly
 * empty) decorative slug and the canonical shareId.
 *
 * - With a slug: `<slug>-<shareId>` (the shareId is always the part after the
 *   last hyphen, since the shareId alphabet never contains a hyphen).
 * - Without a slug: just `<shareId>` (legacy/bare form).
 */
export function buildShareSegment(
  slug: string | null | undefined,
  shareId: string,
): string {
  return slug ? `${slug}-${shareId}` : shareId;
}

/**
 * Extracts the canonical shareId from a share/embed URL segment that may be
 * either the legacy bare shareId or the `<slug>-<shareId>` form. Because the
 * shareId alphabet contains no hyphens, the real id is always the substring
 * after the last hyphen (or the whole segment when there is none).
 */
export function shareIdFromParam(param: string): string {
  const idx = param.lastIndexOf("-");
  return idx === -1 ? param : param.slice(idx + 1);
}
