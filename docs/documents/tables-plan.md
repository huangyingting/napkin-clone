---
type: "plan"
status: "planned"
last_updated: "2026-06-29"
description: "This plan defines first-class table support in the document editor. Presentation decks already support first-class table slide elements; document tables are the structured authoring source that can feed search, import, export, AI deck generation, and presentation table/evidence slots."
---

# Document Table Support Plan

This plan defines first-class table support in the document editor. Presentation
decks already support first-class table slide elements; document tables are the
structured authoring source that can feed search, import, export, AI deck
generation, and presentation table/evidence slots.

## Goals

- Add document tables as structured content blocks, not spreadsheet widgets.
- Use Lexical's official table primitives for editing behavior instead of
  hand-rolling table selection, keyboard movement, paste, and collaboration
  semantics.
- Preserve table structure through `Document.contentJson`, block extraction,
  plain-text projection, search, export, source references, and slide
  generation.
- Map document tables cleanly into presentation `TableElement` data or
  package-template table slots when selected by deterministic or AI generation.

## Non-Goals

- Do not build spreadsheet behavior: formulas, sort/filter, range operations,
  merge/split cells, nested tables, or per-cell style panels.
- Do not share presentation layout fields with document table blocks.
- Do not make every document table automatically become its own slide.
- Do not attempt full DOCX/HTML complex-table fidelity in the first version.

## Confirmed Decisions

- Use `@lexical/table` as the document table editing foundation.
- Define a first-class `DocumentTableBlock`; do not keep tables long-term as
  `DocumentTextBlock.table?` metadata.
- Keep document table schema independent from presentation `TableElement`, but
  make the content shape easy to map between the two.
- Add `blockKind: "table"` anywhere source references, comments, staleness, or
  anchors currently distinguish text and visual blocks.
- Table cells preserve existing `TextRun[]` inline formatting where available.
- Table cells do not carry individual style blocks; table authoring style is
  intentionally minimal.
- Document tables support optional `caption`; captions come from explicit table
  metadata such as HTML `<caption>`, not heuristic nearby paragraph inference.
- Document table editor limits are wider than presentation limits: 1-12 columns
  and 1-100 rows.
- Presentation mapping applies its own slide-friendly limits. AI/package
  template generation still clamps to 2-4 columns and 2-6 rows and moves
  overflow to notes.
- Document tables participate in plain-text/search/export/AI/staleness
  projections. Markdown pipe table is the default plain-text representation.
- Document tables are structured candidates for slides, not mandatory one-table
  one-slide output.

## Data Contract

Target extracted block shape:

```ts
export type DocumentTableBlock = {
  kind: "table";
  blockId?: string;
  caption?: string;
  columns: DocumentTableColumn[];
  rows: DocumentTableRow[];
};

export type DocumentTableColumn = {
  id: string;
  label: string;
};

export type DocumentTableRow = {
  id: string;
  cells: DocumentTableCell[];
};

export type DocumentTableCell = {
  text: string;
  runs?: TextRun[];
};

export type DocumentBlock =
  | DocumentTextBlock
  | DocumentVisualBlock
  | DocumentTableBlock;
```

Rules:

- Column ids and row ids are stable identity fields.
- Each row must contain exactly one cell per column after import/repair.
- Import, paste, and Lexical table extraction may pad or truncate rows before
  producing a `DocumentTableBlock`.
- Cell `text` remains the plain fallback and equals the concatenation of `runs`
  text when runs are present.

## Editor MVP

First-version document editor behavior:

- Insert a default 2x2 or 3x3 table.
- Edit text inside cells with the existing inline formatting affordances where
  Lexical table cells support them.
- Use Tab and Shift+Tab to move between cells.
- Support undo/redo, autosave, and collaboration through the existing Lexical
  and Yjs stack.
- Add row and column insertion/deletion through a toolbar command or cell menu.
- Support an explicit caption field.

Out of scope for the MVP:

- Merged cells.
- Per-cell background, border, alignment, or width editing.
- Formulas, sorting, filtering, and spreadsheet keyboard shortcuts.
- Nested tables.

## Import And Paste

MVP import/paste coverage:

- Markdown pipe tables convert to Lexical tables.
- HTML `<table>` paste/import converts to Lexical tables and preserves explicit
  `<caption>` when present.
- DOCX simple tables are best-effort through the existing import pipeline.
- Merged cells are flattened or downgraded to representable text; complex table
  styles are discarded.
- Imported table text preserves basic inline runs where the source parser makes
  them available.

## Plain Text, Search, And Export

Projection rules:

- Plain text uses Markdown pipe table format, preceded by caption when present.
- Search indexes caption, column labels, and cell text.
- AI deck source includes caption, columns, a bounded row preview, total row
  count, and overflow summary.
- Document export should emit real tables for HTML/PDF/DOCX-capable paths and
  Markdown tables for plain text or Markdown output.
- Staleness/content hash includes caption, column ids/labels, row ids, cell
  text, and cell runs.

## Presentation Mapping

Document tables feed presentation generation as structured candidates:

- Deterministic fallback generation may create a table slide for an independent
  table block when slide count and content density allow it.
- Package-template AI generation receives tables as structured context and can
  choose `evidence`, `table`, `data-insight`, `comparison`, notes, or no slide.
- Manual insert-from-document can materialize a document table as a presentation
  `TableElement` with `source.blockKind = "table"`.
- Presentation-side repair and export remain governed by the presentation table
  contract in [../data-model/deck.md](../data-model/deck.md).

## Implementation Phases

### Phase 1: Lexical Table Foundation

- Add `@lexical/table`.
- Register Lexical table nodes in the editor node set.
- Add insertion command and minimal toolbar/menu entry.
- Verify autosave, undo/redo, collaboration, and serialization round-trip.

### Phase 2: Document Block Contract

- Add `DocumentTableBlock` and table cell/runs types.
- Update `collectDocumentBlocks` to emit `kind: "table"`.
- Remove the transitional long-term dependency on `DocumentTextBlock.table?`.
- Add extraction tests for simple tables, captions, ids, row padding/truncation,
  and rich cell text.

### Phase 3: Source References And Staleness

- Extend `SourceRef.blockKind` and related anchors to include `"table"`.
- Update source-link staleness, relink/unlink, comments anchors, duplication,
  and deck dependency reconciliation.
- Add hash tests that distinguish table semantic edits from unrelated document
  changes.

### Phase 4: Import, Paste, And Projection

- Convert Markdown pipe tables and HTML tables into Lexical tables.
- Preserve simple DOCX tables where the import path exposes them.
- Update plain-text, search, AI source, and export projections.
- Add tests for Markdown pipe output and import/paste downgrade behavior.

### Phase 5: Presentation Integration

- Map `DocumentTableBlock` into manual insert-from-document `TableElement`.
- Feed table blocks into package-template generation as structured table
  context.
- Keep deterministic slide generation conservative: table slides are candidates,
  not mandatory output.

## Validation

- `npm run test:subsystem -- documents`
- `npm run test:subsystem -- editor`
- `npm run test:subsystem -- import`
- `npm run test:subsystem -- presentation`
- `npm run typecheck`
- `npm run docs:check`
