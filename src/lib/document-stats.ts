/**
 * Pure, framework-free helpers for deriving display stats from a document's
 * text content (Markdown or plain text). These power the editor stats line,
 * dashboard cards, and any read view, so they all show the same numbers.
 *
 * No React / Next imports — safe to run server-side and unit-test under
 * `node --test` + `tsx`.
 */

const WORDS_PER_MINUTE = 200;
const DEFAULT_EXCERPT_CHARS = 160;

/** Splits text into whitespace-delimited word tokens, ignoring empties. */
function words(text: string): string[] {
  if (typeof text !== "string") {
    return [];
  }
  const trimmed = text.trim();
  if (trimmed === "") {
    return [];
  }
  return trimmed.split(/\s+/);
}

/** Counts the number of words in the given text. */
export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Estimates reading time in whole minutes at ~200 wpm. Always returns at least
 * 1 minute for any non-empty text; empty text returns 0.
 */
export function readingTimeMinutes(text: string): number {
  const count = wordCount(text);
  if (count === 0) {
    return 0;
  }
  return Math.max(1, Math.round(count / WORDS_PER_MINUTE));
}

/**
 * Strips the lightweight Markdown syntax we support (headings, list markers,
 * emphasis, inline code, links, blockquotes) down to readable plain text and
 * collapses whitespace.
 */
function stripMarkdown(text: string): string {
  if (typeof text !== "string") {
    return "";
  }
  return (
    text
      // fenced code blocks
      .replace(/```[\s\S]*?```/g, " ")
      // images: ![alt](url) -> alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // links: [text](url) -> text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // inline code
      .replace(/`([^`]*)`/g, "$1")
      // heading hashes at line start
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      // blockquote markers
      .replace(/^\s{0,3}>\s?/gm, "")
      // list markers (-, *, +, or "1.")
      .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, "")
      // bold / italic / strikethrough markers
      .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, "$2")
      // any leftover emphasis characters
      .replace(/[*_~`#>]/g, "")
      // collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Produces a short excerpt of the document content. Markdown syntax is
 * stripped, whitespace collapsed, and the result truncated on a word boundary
 * (no mid-word cut) with a trailing ellipsis when shortened.
 */
export function excerpt(
  text: string,
  maxChars: number = DEFAULT_EXCERPT_CHARS,
): string {
  const plain = stripMarkdown(text);
  const limit =
    Number.isFinite(maxChars) && maxChars > 0
      ? Math.floor(maxChars)
      : DEFAULT_EXCERPT_CHARS;

  if (plain.length <= limit) {
    return plain;
  }

  const sliced = plain.slice(0, limit);
  const lastSpace = sliced.lastIndexOf(" ");
  const boundary = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return `${boundary.trimEnd()}…`;
}
