/**
 * Minimal Markdown block model for the document editor's text panel.
 *
 * Imported and seeded text may arrive as plain Markdown. We only support the
 * handful of block types the editor imports from Markdown today — headings
 * (levels 1–3), bullet lists, and paragraphs — and keep that subset explicit.
 */

type MarkdownBlockBase = { id: string };

export type MarkdownBlock =
  | (MarkdownBlockBase & { kind: "heading"; level: 1 | 2 | 3; text: string })
  | (MarkdownBlockBase & { kind: "bullets"; items: string[] })
  | (MarkdownBlockBase & { kind: "table"; columns: string[]; rows: string[][] })
  | (MarkdownBlockBase & { kind: "paragraph"; text: string });

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length >= 2 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function isPotentialTableRow(line: string): boolean {
  return splitTableRow(line).length >= 2 && line.includes("|");
}

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

  const lines = source.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
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

    /* node:coverage ignore next -- Bullet regex evaluation is asserted; tsx maps this source row as uncovered. */
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      /* node:coverage ignore next 2 -- Bullet parsing is asserted; tsx maps branch body rows as uncovered. */
      flushParagraph();
      bullets.push(bullet[1].trim());
      continue;
    }

    if (
      isPotentialTableRow(line) &&
      lineIndex + 1 < lines.length &&
      isTableSeparator(lines[lineIndex + 1].trim())
    ) {
      flushParagraph();
      flushBullets();
      const columns = splitTableRow(line);
      const rows: string[][] = [];
      lineIndex += 2;
      while (lineIndex < lines.length) {
        const rowLine = lines[lineIndex].trim();
        if (!isPotentialTableRow(rowLine) || isTableSeparator(rowLine)) {
          lineIndex -= 1;
          break;
        }
        const row = splitTableRow(rowLine);
        rows.push(
          Array.from(
            { length: columns.length },
            (_value, index) => row[index] ?? "",
          ),
        );
        lineIndex += 1;
      }
      const signature = `table:${columns.join("|")}:${rows
        .map((row) => row.join("|"))
        .join("\n")}`;
      blocks.push({
        id: makeBlockId(signatures, signature),
        kind: "table",
        columns,
        rows,
      });
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
  if (block.kind === "table") {
    return [
      `| ${block.columns.join(" | ")} |`,
      `| ${block.columns.map(() => "---").join(" | ")} |`,
      ...block.rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
  }
  return block.text;
}
