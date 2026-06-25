const MAX_FILENAME_LENGTH = 120;

/**
 * Sanitize a string for safe use as a download filename (without extension).
 *
 * - Trims leading/trailing whitespace
 * - Replaces path separators, Windows-reserved chars, and ASCII control chars with "_"
 * - Collapses runs of whitespace to a single space
 * - Strips leading/trailing dots and spaces
 * - Caps length at MAX_FILENAME_LENGTH characters
 * - Returns `fallback` (default "visual") when the result is empty
 */
export function sanitizeFilename(name: string, fallback = "visual"): string {
  let s = name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[/\\:*?"<>|\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "_")
    .trim();

  s = s.replace(/^[. ]+|[. ]+$/g, "");

  if (s.length > MAX_FILENAME_LENGTH) {
    s = s.slice(0, MAX_FILENAME_LENGTH).replace(/[. ]+$/, "");
  }

  return s || fallback;
}
