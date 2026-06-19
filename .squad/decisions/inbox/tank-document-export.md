# Tank — Document-level Export Architecture

**Date:** 2026-06-19  
**By:** Tank (Backend Developer)  
**Issue:** #5

## Decision

### 1. Block-collection is a pure, headless function

`collectDocumentBlocks(state)` (in `src/lib/visual/document-export.ts`) walks the
serialised Lexical JSON tree (`{ root: { children } }`) and returns a flat ordered
array of `DocumentBlock` values — `DocumentTextBlock` (heading / paragraph / quote /
listitem / hr) or `DocumentVisualBlock` (visualId + Visual payload). It has no browser
or React dependencies, so it is fully testable under `node --test`.

The PDF/PPTX assembly functions (`exportDocumentAsPDF`, `exportDocumentAsPPTX`) are
browser-only (they use jsPDF, pptxgenjs, and the canvas API for PNG conversion) and are
kept in the same module but never imported by test files. This mirrors how
`collectVisualNodes` / `lexicalStateToPlainText` work in the existing codebase.

### 2. VisualSvgRegistry context for live SVG elements

Each `VisualCard` registers a `getSvg` callback (keyed by `visualId`) in a
`VisualSvgRegistry` React context (Map<visualId, () => SVGSVGElement | null>).
This lets the document export button resolve every visual's live, already-rendered
SVG element without DOM traversal. A stable-ref wrapper in
`useRegisterVisualSvg` prevents spurious re-registrations.

The registry is populated regardless of whether the card is in read-only or editable
mode: `VisualRenderer` now receives `ref={rendererRef}` in all three render branches of
`VisualCard` (editing controls open, clickable button, read-only). This is a small
additive change with no behaviour impact on the per-visual export path.

### 3. visualId is passed as a prop to VisualCard

`VisualNode.decorate()` now passes `visualId={this.__visualId}` alongside `visual=` and
`nodeKey=` to `VisualCard`. This is the stable document-level identity that lets the
export registry match `collectDocumentBlocks` output to the live SVG getter. No NodeKey
is persisted (consistent with the existing collab contract).

### 4. DocumentExportButton lives inside LexicalComposer

The new `DocumentExportButton` component uses `useLexicalComposerContext` to read the
current editor state on demand (at export time, not on every keystroke). The
`VisualSvgRegistryProvider` wraps the `LexicalComposer` subtree so both the button and
the `VisualCard` decorators share the same registry instance.

### 5. PDF layout: text blocks + visual-per-page

The document PDF uses A4 portrait pages. Text blocks (headings at 18/15/13pt,
paragraphs/quotes at 11pt, list items at 11pt with bullet prefix) are flowed with
automatic line-wrapping and page breaks. Each visual gets its own A4 page (landscape if
`viewBox.width > height`), inset at ~10% margins. Documents with zero visuals produce a
text-only PDF; documents with no text produce visual-only pages.

### 6. PPTX: one slide per visual; title-only fallback

Each visual produces one 10×7.5" slide. The nearest preceding heading (scanning
backwards from the visual in the block list) becomes the slide title. If there are no
visuals, a single title slide is emitted so the deck is never empty/invalid.

### 7. Per-visual export is untouched

`ExportMenu` and `exportPDF` / `exportPPTX` in `src/lib/visual/export.ts` are
unchanged. The new code reuses `exportPNG` as a shared internal (SVG → PNG conversion)
to avoid duplication.
