/**
 * Minimal Markdown block model for the document editor's text panel.
 *
 * The document `content` is stored as plain Markdown (AI-friendly and backward
 * compatible with seeded plain text). We only support the handful of block
 * types the editor exposes — headings (levels 1–3), bullet lists, and
 * paragraphs — and render them with React elements (never `dangerouslySetInnerHTML`),
 * so there is no HTML-injection surface.
 */

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "paragraph"; text: string };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;

/**
 * Parses a Markdown string into a flat list of supported blocks. Consecutive
 * plain lines join into one paragraph; consecutive bullet lines join into one
 * list; a blank line ends the current block.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push({ kind: "bullets", items: bullets });
      bullets = [];
    }
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushBullets();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1].trim());
      continue;
    }

    flushBullets();
    paragraph.push(line);
  }

  flushParagraph();
  flushBullets();
  return blocks;
}

export type BlockType = "h1" | "h2" | "h3" | "bullet" | "paragraph";

const BLOCK_PREFIX: Record<BlockType, string> = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  bullet: "- ",
  paragraph: "",
};

const LEADING_PREFIX = /^\s*(?:#{1,6}\s+|[-*+]\s+)?/;

/**
 * Applies a block type to every line spanned by the current text selection,
 * replacing any existing block prefix. Returns the new value plus the selection
 * that covers the modified lines, so callers can restore the caret/selection in
 * a textarea.
 */
export function applyBlockType(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  type: BlockType,
): { value: string; selectionStart: number; selectionEnd: number } {
  const lines = value.split("\n");

  const startLine = value.slice(0, selectionStart).split("\n").length - 1;
  let endLine = value.slice(0, selectionEnd).split("\n").length - 1;
  // A selection that ends exactly on a line break shouldn't pull in the next line.
  if (selectionEnd > selectionStart && value[selectionEnd - 1] === "\n") {
    endLine = Math.max(startLine, endLine - 1);
  }

  for (let i = startLine; i <= endLine; i++) {
    const stripped = lines[i].replace(LEADING_PREFIX, "");
    lines[i] = BLOCK_PREFIX[type] + stripped;
  }

  const newValue = lines.join("\n");

  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }

  return {
    value: newValue,
    selectionStart: offsets[startLine],
    selectionEnd: offsets[endLine] + lines[endLine].length,
  };
}
