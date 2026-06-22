/**
 * Pure, DOM-free helpers that turn a document's collected blocks into
 * click-to-insert "insertables" for the slide editor's "From document" panel.
 *
 * {@link buildInsertables} flattens the document's text and visual blocks into a
 * compact, ordered list (skipping rules/empties, deduping visuals), and
 * {@link insertableTextElement} builds the canonical {@link TextElement} for a
 * text insertable. Both are framework/DOM-free so they run under `node --test`
 * and stay the single source of truth for the panel's insert behaviour.
 *
 * Source-ref stamping (issue #377):
 *  - Every text insertable carries a `contentHash` computed from the block
 *    content so staleness can be detected without a full re-derive.
 *  - When the source block also carries a `blockId` the insertable exposes it
 *    so callers can build a full {@link SourceRef}.
 *  - {@link insertableTextElement} accepts an optional `documentId` in its
 *    `options` parameter.  When both `documentId` and `blockId` are present
 *    it stamps `sourceRef` on the returned element.  The `documentId` wiring
 *    from the slide-editor call-site is tracked in issue #377.
 */

import type {
  DocumentBlock,
  DocumentTextBlock,
} from "@/lib/visual/document-export";

import {
  makeElementId,
  type BaseElement,
  type ElementBox,
  type SourceRef,
  type TextElement,
  type TextRun,
} from "./deck";
import { hashDocumentBlock } from "./document-block-hash";
import { headingFontSize, SLIDE_TEXT_FONT_SIZE } from "./text-defaults";

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
      /**
       * Stable id of the source document block (issue #377).
       * Present only when the block was collected with `blockId` set; absent
       * for blocks collected before node-key extraction was wired.
       */
      blockId?: string;
      /**
       * Deterministic hash of the source block content at collection time
       * (issue #377). Always present so staleness detection works even before
       * `blockId` / `documentId` are fully wired.
       */
      contentHash: string;
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
    ...(block.blockId ? { blockId: block.blockId } : {}),
    contentHash: hashDocumentBlock(block),
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

/**
 * Builds a {@link SourceRef} from a document block's provenance fields.
 *
 * All four fields are required by the caller because `SourceRef.documentId`
 * and `SourceRef.blockId` are non-optional in the model.  The helper is
 * exported so that future call-sites (slide command executor, merge path) can
 * build refs without duplicating the construction pattern.
 *
 * **UI wiring note (issue #377):** `documentId` is not yet threaded through
 * the "From document" panel insert handler in `slide-editor.tsx`.  Once the
 * panel receives `documentId` as a prop, call this helper in
 * `handleInsertDocumentText` and pass the result via `options.sourceRef` (or
 * the equivalent field when the API is finalised).
 */
export function buildSourceRefFromBlock(
  documentId: string,
  blockId: string,
  contentHash: string,
  linkedAt: string,
): SourceRef {
  return { documentId, blockId, contentHash, linkedAt };
}

/**
 * Builds the canonical {@link TextElement} (sans `zIndex`) for a text
 * {@link Insertable}. Pure and DOM-free: callers route the result through
 * `addElement`/`onDeckChange` so the insert stays undoable. `zIndex` is assigned
 * by `addElement`, so it is intentionally omitted here.
 *
 * Headings map to a larger, bold element (level 1 → `role: "title"`); other
 * blocks map to a body-sized element. Runs are carried only when present.
 *
 * **Source-ref stamping (issue #377):** Pass `options.documentId` together
 * with a `linkedAt` ISO timestamp to stamp `sourceRef` on the returned
 * element.  When `documentId` is provided but the insertable carries no
 * `blockId` (block collected before node-key wiring) the stamp is skipped and
 * no `sourceRef` is set — the element behaves like a pre-#377 insert.
 */
export function insertableTextElement(
  item: Extract<Insertable, { kind: "text" }>,
  options: {
    id?: string;
    /** Source document id — required to stamp a full `sourceRef`. */
    documentId?: string;
    /**
     * ISO timestamp for `sourceRef.linkedAt`.
     * Defaults to `new Date().toISOString()` when `documentId` is provided
     * but `linkedAt` is omitted.
     */
    linkedAt?: string;
  } = {},
): Omit<TextElement, "zIndex"> & { id: string } {
  const heading = item.heading;
  const fontSize = heading
    ? headingFontSize(item.level)
    : SLIDE_TEXT_FONT_SIZE.text;
  const role: TextElement["role"] =
    heading && item.level === 1 ? "title" : "body";

  const sourceRef: BaseElement["sourceRef"] =
    options.documentId !== undefined && item.blockId !== undefined
      ? buildSourceRefFromBlock(
          options.documentId,
          item.blockId,
          item.contentHash,
          options.linkedAt ?? new Date().toISOString(),
        )
      : undefined;

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
    ...(sourceRef !== undefined ? { sourceRef } : {}),
  };
}

