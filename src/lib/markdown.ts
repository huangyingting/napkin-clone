/**
 * Minimal Markdown block model for the document editor's text panel.
 *
 * The document `content` is stored as plain Markdown (AI-friendly and backward
 * compatible with seeded plain text). We only support the handful of block
 * types the editor exposes — headings (levels 1–3), bullet lists, and
 * paragraphs — and render them with React elements (never `dangerouslySetInnerHTML`),
 * so there is no HTML-injection surface.
 */

type MarkdownBlockBase = { id: string };

export type MarkdownBlock =
  | (MarkdownBlockBase & { kind: "heading"; level: 1 | 2 | 3; text: string })
  | (MarkdownBlockBase & { kind: "bullets"; items: string[] })
  | (MarkdownBlockBase & { kind: "paragraph"; text: string });

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function makeBlockId(
  signatures: Map<string, number>,
  signature: string,
): string {
  const occurrence = (signatures.get(signature) ?? 0) + 1;
  signatures.set(signature, occurrence);
  return `block-${hashString(signature)}-${occurrence}`;
}

/**
 * Parses a Markdown string into a flat list of supported blocks. Consecutive
 * plain lines join into one paragraph; consecutive bullet lines join into one
 * list; a blank line ends the current block.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const signatures = new Map<string, number>();

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const text = paragraph.join(" ");
      const signature = `paragraph:${text}`;
      blocks.push({
        id: makeBlockId(signatures, signature),
        kind: "paragraph",
        text,
      });
      paragraph = [];
    }
  };

  const flushBullets = () => {
    if (bullets.length > 0) {
      const items = bullets;
      const signature = `bullets:${items.join("\n")}`;
      blocks.push({
        id: makeBlockId(signatures, signature),
        kind: "bullets",
        items,
      });
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
      const level = heading[1].length as 1 | 2 | 3;
      const text = heading[2].trim();
      const signature = `heading:${level}:${text}`;
      blocks.push({
        id: makeBlockId(signatures, signature),
        kind: "heading",
        level,
        text,
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

/**
 * Returns the plain text of a single block, suitable for sending to
 * `/api/generate` when illustrating just that block (US-009). Bullet lists are
 * rejoined as Markdown-style list lines so the model keeps the list structure.
 */
export function blockText(block: MarkdownBlock): string {
  if (block.kind === "bullets") {
    return block.items.map((item) => `- ${item}`).join("\n");
  }
  return block.text;
}
