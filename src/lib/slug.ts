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
 * Builds a slug candidate from a title plus an optional random suffix.
 *
 * The suffix is appended after a hyphen so the result stays within
 * MAX_SLUG_LENGTH. When the title has no usable characters the suffix alone
 * is returned (empty string when both are absent).
 *
 * Keeping the suffix as a caller-supplied parameter makes this function pure
 * and unit-testable without any randomness dependency.
 */
export function buildSlugCandidate(title: string, suffix?: string): string {
  const base = slugify(title);
  if (!suffix) return base;
  if (!base) return suffix;

  // Reserve room for the hyphen separator and the suffix.
  const room = MAX_SLUG_LENGTH - 1 - suffix.length;
  const trimmedBase = room > 0 ? base.slice(0, room).replace(/-+$/, "") : "";
  return trimmedBase ? `${trimmedBase}-${suffix}` : suffix;
}

/**
 * Builds the URL path segment used in a share/embed link.
 */
export function buildShareSegment(
  slug: string | null | undefined,
  shareId: string,
): string {
  const cleanSlug = slug?.trim();
  if (!cleanSlug || !shareId) {
    throw new Error("Share links require both slug and shareId.");
  }
  return `${cleanSlug}-${shareId}`;
}

/**
 * Extracts the canonical shareId from a `<slug>-<shareId>` URL segment. Because
 * the shareId alphabet contains no hyphens, the real id is the substring after
 * the last hyphen. Malformed/bare segments return an empty id.
 */
export function shareIdFromParam(param: string): string {
  const idx = param.lastIndexOf("-");
  return idx > 0 && idx < param.length - 1 ? param.slice(idx + 1) : "";
}
