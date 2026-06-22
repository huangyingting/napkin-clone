/**
 * Pure, DOM-free helpers that turn a document's collected blocks into
 * click-to-insert "insertables" for the slide editor's "From document" panel.
 *
 * {@link buildInsertables} flattens the document's text and visual blocks into a
 * compact, ordered list (skipping rules/empties, deduping visuals), and
 * {@link insertableTextElement} builds the canonical {@link TextElement} for a
 * text insertable. Both are framework/DOM-free so they run under `node --test`
 * and stay the single source of truth for the panel's insert behaviour.
 */

import type {
  DocumentBlock,
  DocumentTextBlock,
} from "@/lib/visual/document-export";

import {
  makeElementId,
  type ElementBox,
  type TextElement,
  type TextRun,
} from "./deck";

/** A single click-to-insert entry derived from the source document. */
export type Insertable =
  | { kind: "visual"; visualId: string }
  | {
      kind: "text";
      /** Short, truncated label for the card. */
      label: string;
      /** Full plain text inserted onto the slide. */
      text: string;
      /** Inline rich-text runs, carried only when present and non-empty. */
      runs?: TextRun[];
      /** True for heading blocks (rendered larger/bold). */
      heading: boolean;
      /** Heading level (1–3), only set for headings. */
      level?: 1 | 2 | 3;
    };

/** Max characters kept in a text card label before ellipsis. */
const LABEL_MAX = 40;

/** Trims and ellipsizes a block's text into a short card label. */
function toLabel(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= LABEL_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}

function textInsertable(block: DocumentTextBlock): Insertable {
  const heading = block.blockType === "heading";
  const runs = block.runs && block.runs.length > 0 ? block.runs : undefined;
  return {
    kind: "text",
    label: toLabel(block.text),
    text: block.text,
    ...(runs ? { runs } : {}),
    heading,
    ...(heading && block.level ? { level: block.level } : {}),
  };
}

/**
 * Flattens collected document blocks into ordered {@link Insertable}s.
 *
 * Preserves document order; skips horizontal rules and empty/whitespace-only
 * text; dedupes visuals by `visualId` (keeping the first occurrence).
 */
export function buildInsertables(blocks: DocumentBlock[]): Insertable[] {
  const out: Insertable[] = [];
  const seenVisuals = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "visual") {
      if (seenVisuals.has(block.visualId)) continue;
      seenVisuals.add(block.visualId);
      out.push({ kind: "visual", visualId: block.visualId });
      continue;
    }
    if (block.blockType === "hr") continue;
    if (block.text.trim() === "") continue;
    out.push(textInsertable(block));
  }
  return out;
}

/** Default box for a freshly inserted document-text element, percent units. */
const DEFAULT_TEXT_BOX: ElementBox = { x: 12, y: 28, w: 76, h: 18 };

/** Font size (percent of slide height) for each heading level. */
function headingFontSize(level: 1 | 2 | 3 | undefined): number {
  switch (level) {
    case 1:
      return 6.5;
    case 2:
      return 5.5;
    default:
      return 5;
  }
}

/**
 * Builds the canonical {@link TextElement} (sans `zIndex`) for a text
 * {@link Insertable}. Pure and DOM-free: callers route the result through
 * `addElement`/`onDeckChange` so the insert stays undoable. `zIndex` is assigned
 * by `addElement`, so it is intentionally omitted here.
 *
 * Headings map to a larger, bold element (level 1 → `role: "title"`); other
 * blocks map to a body-sized element. Runs are carried only when present.
 */
export function insertableTextElement(
  item: Extract<Insertable, { kind: "text" }>,
  options: { id?: string } = {},
): Omit<TextElement, "zIndex"> & { id: string } {
  const heading = item.heading;
  const fontSize = heading ? headingFontSize(item.level) : 4;
  const role: TextElement["role"] =
    heading && item.level === 1 ? "title" : "body";
  return {
    id: options.id ?? makeElementId(),
    kind: "text",
    role,
    text: item.text,
    ...(item.runs && item.runs.length > 0 ? { runs: item.runs } : {}),
    box: { ...DEFAULT_TEXT_BOX },
    style: {
      fontSize,
      bold: heading,
      italic: false,
      align: "left",
    },
  };
}
