# Current Deck Model

**Status:** Current  
**Last updated:** 2026-06-29

This document defines the current `Document.deckJson` contract. The deck schema
is development-authoritative: payloads that do not match the current shape are
rejected instead of repaired or upgraded at runtime.

## Source Of Truth

`Document.deckJson` stores a complete `Deck` JSON object. It is independent of
`Document.contentJson`; document edits and deck edits persist through separate
write paths.

`Document.contentJson` can derive a fresh deck, but once saved, the deck is its
own authored artifact. Sync from document is an explicit editor action.

## Schema Gate

The current deck version is exported from
`src/lib/presentation/deck.ts` as `CURRENT_DECK_SCHEMA_VERSION`.

`safeParseDeck` / `validateDeck` in
`src/lib/presentation/deck-schema.ts` enforce the persisted shape:

- `Deck.schemaVersion` must be the current version.
- `Deck.canvas.format` is required and is the deck-level slide format.
- `Deck.design.themeId` is required and is the presentation theme selector.
- `Deck.masters[]` and `Deck.defaultMasterId` are required; the default master
  id must reference an existing master.
- `Deck.slides[]` must be present and validated in order.
- Every slide must carry `id`, `index`, `title`, and `elements`. `notes`,
  `masterId`, `templateId`, `designOverrides`, and `source` are optional.
- `Slide.elements` must be an array. It is the authoritative render/export
  surface.
- Every element stores kind-specific payload under `content`, and
  `content.kind` must match the element `kind`.
- Text elements carry `content.paragraphs[]`, the canonical paragraph model for
  plain text, bullets, and numbered lists.
- Removed v5 fields are rejected, including top-level `themeId`,
  `customTokenSet`, `slideFormat`, `layouts`, and slide-level `bullets`,
  `bulletRuns`, `visualIds`, `layout`, `elementsDerived`, `masterRef`, and
  `sourceSectionId`.
- `BaseElement.layoutSlot`, `PlaceholderElement`, `BulletsElement`, and
  flat kind payload fields are no longer supported in persisted decks.
- `SourceRef.blockKind` is required and must be `"text"`, `"visual"`, or
  `"table"`.
- Serialized deck JSON strings are persisted-schema drift, not supported
  persisted input.

There is no deck migration shim. A schema bump means fixtures, generators, and
persisted development data must be updated to the new shape. Current decks use
schema v6.

## v6 Vocabulary

| Term                 | Current meaning                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Deck.canvas`        | Deck-wide slide format and page geometry source.                                                                   |
| `PresentationDesign` | The selected presentation theme plus optional deck-level theme overrides under `Deck.design`.                      |
| `SlideMaster`        | Deck-owned global shared chrome: background treatment and locked background/foreground master elements.            |
| `SlideTemplate`      | Creation or explicit-reapply blueprint. Templates materialize elements and are not normal render dependencies.     |
| `Slide`              | Authored page instance with metadata, optional template provenance, optional slide design overrides, and elements. |
| `SlideElement`       | Authoritative authored content element with geometry, role, content, source, and local design overrides.           |
| `MasterElement`      | Locked shared chrome element from a master, identified by `masterChromeKind` and rendered by its layer band.       |
| `designOverrides`    | Persisted partial design override at slide or element level; absent keys inherit from the higher layer.            |
| `Resolved*Design`    | Runtime-only concrete design metadata produced by render/export resolvers.                                         |

The current schema uses presentation-native vocabulary. Superseded names such
as top-level `themeId`, `customTokenSet`, `slideFormat`, `layouts`, slide
`layout`, slide `visualIds`, slide `bullets`, and layout placeholders are not
accepted persisted deck fields.

## Deck Shape

The persisted object is shaped as:

```ts
type Deck = {
  schemaVersion: 6;
  canvas: { format: SlideFormat };
  design: PresentationDesign;
  masters: SlideMaster[];
  defaultMasterId: string;
  customTemplates?: SlideTemplate[];
  slides: Slide[];
  deckContentHash?: string;
};

type PresentationDesign = {
  themeId: string;
  themeOverrides?: Record<string, unknown>;
};
```

`canvas` owns geometry. `design` owns global visual language. `masters` own live
shared chrome. `customTemplates` stores deck-local template blueprints,
including installed theme package templates (`theme:*:*`) and user-created
custom templates (`custom-*`). Older generic built-in templates live in code.
`slides[]` owns authored page content.

## Slide Content Model

### `Slide.elements[]`

`elements[]` is the current slide content model. Renderers, exporters, and the
stage editor consume positioned elements directly.

Supported element kinds are defined in `src/lib/presentation/deck.ts`:

- `text`
- `visual`
- `image`
- `shape`
- `connector`
- `table`

Each element has stable identity, geometry, z-order, optional presentation
`role`, optional element-level `source`, kind-specific `content`, and local
`designOverrides`.

`TextElement.content.paragraphs[]` is the canonical text payload. Plain
paragraphs omit `listType`; bulleted and numbered paragraphs set `listType` and
optional `indent`. `content.text` is the compact text string, and `content.runs`
/ paragraph `runs` carry inline rich text.

`TableElement` is a first-class v6 element. It uses `kind: "table"` and optional
`role: "table"`. The persisted content shape is:

```ts
type TableElementContent = {
  kind: "table";
  columns: Array<{ id: string; label: string; width?: number }>;
  rows: Array<{ id: string; cells: Array<{ text: string; runs?: TextRun[] }> }>;
  header?: boolean;
  caption?: string;
};
```

Persisted tables accept 1-8 columns and 1-20 rows. Column ids and row ids must
be unique and stable; editing a label or cell text must not regenerate them.
Every row must carry exactly one cell per column. Schema validation rejects
mismatched cell counts instead of normalizing persisted data. AI generation,
import, and paste boundaries may repair incoming tables before they reach
`safeParseDeck`.

Table styling lives in `designOverrides.tableStyle` and is table-level only:
`headerFill`, `rowFill`, `alternateRowFill`, `borderColor`, `borderWidth`,
`textStyle`, and `headerTextStyle`. Individual cells do not carry style blocks;
cell `runs` preserve existing inline `TextRun` formatting where available.

The editor treats tables as whole elements on the canvas: selection, drag,
resize, z-order/layer visibility, and duplicate/delete work like other element
kinds. Cell content, row/column add/remove, header flag, caption, and table
style edits live in the table inspector panel.

Templates are blueprints. Applying or creating from a template materializes real
typed elements with `content`; `Slide.templateId` is provenance only. Template
elements may carry the same scalar presentation fields used by slide elements,
including `opacity`, `rotation`, `locked`, and `name`, so package templates can
preserve authored decorative layers when they materialize.

Masters are live deck data, not creation-time blueprints. The current product
uses the deck-wide global master resolved from `Deck.defaultMasterId` (falling
back to the first master). `Slide.masterId` remains in the persisted type for
now but is not used by current render, editor, or template flows. Master
elements are locked chrome and render in separate layer bands around slide
content:

```text
theme/master/slide background
  -> master background elements
  -> slide elements
  -> master foreground elements
```

Master and slide element z-indexes are sorted inside their own layer bands, not
merged into one cross-layer z-index space.

Every `MasterElement` must carry a `masterChromeKind` identity marker. This is
the master chrome identity; `role` is only the theme/style role. Valid master
chrome combinations are:

| `masterChromeKind` | `kind`  | `role`       | `layer`      |
| ------------------ | ------- | ------------ | ------------ |
| `logo`             | `image` | `logo`       | `foreground` |
| `footer`           | `text`  | `footer`     | `foreground` |
| `pageNumber`       | `text`  | `pageNumber` | `foreground` |
| `watermark`        | `text`  | `background` | `background` |

Normal `Slide.elements[]` must not contain `masterChromeKind`; slide editing
cannot select or mutate master chrome. Master chrome is configured through the
deck-level Masters popover and rendered/exported through the shared render
model.

### Document-derived metadata

Slides keep only metadata such as `title`, optional `notes`, optional
`templateId`, optional `masterId`, and optional slide `source`. Render content
lives in `elements[]`. The current renderer resolves the deck-wide master from
`Deck.defaultMasterId`; package application still normalizes `Slide.masterId` to
the package default master for provenance and future per-slide master support.

### Provenance

Element-level `source` links preserve the document block or visual an element
came from. `Slide.source.sectionId` is the heading-derived key used to match
document-derived slides even when the on-slide title has been edited.

## Design Overrides And Resolution

Persisted design values are partial overrides. Resetting a local style means
removing the local key so the resolver can inherit again; resolved concrete
values are not copied back into lower layers.

The current runtime resolves deck state in these stages:

```text
Deck.design theme/themeOverrides
  -> SlideMaster background/chrome
  -> SlideTemplate materialization at create or reapply time
  -> Slide.designOverrides
  -> SlideElement.designOverrides
  -> ResolvedSlideRenderModel
```

`SlideTemplate` participates only when a slide is created or explicitly
reapplied. Normal render/export does not look up `Slide.templateId` to derive
content.

## Source References

Slide elements may carry `source` when they are linked to document text or a
document visual.

```ts
type SourceRef = {
  documentId: string;
  blockId: string;
  contentHash?: string;
  linkedAt: string;
  unlinked?: boolean;
  blockKind: "text" | "visual" | "table";
};
```

The block kind is explicit. Refresh, staleness detection, and dependency health
checks never infer a missing kind.

`source.blockId` is durable: for text refs it is the document block
`bid`/`blockId`; for visual refs it is the durable `visualId`. It is never a live
Lexical `NodeKey`.

Source-link helpers live in:

- `src/lib/presentation/source-link-staleness.ts`
- `src/lib/document/source-ref-model.ts`
- `src/components/presentation/slide-editor.tsx`
- `src/lib/presentation/deck-source-refs.ts`

## Deck Creation Paths

### Derive From Document

`buildDeckFromBlocks` converts collected document blocks into v6 slides with
positioned elements, presentation roles, and `content`. Editor and present-mode
derivations pass the document id so derived title, body, and visual elements
also carry element-level `source`; pure public fallbacks do not invent source
refs when no document id is available.

### Generate With AI

AI output may be sparse while it is still model output. Before it can be saved or
shown as a deck, `normalizeGeneratedDeck` assigns the current theme/layout and
current elements. Final output must pass `safeParseDeck`.

Generated table elements are repaired with stricter slide-friendly limits than
the persisted schema: 2-4 columns, 2-6 rows, and bounded cell text. Overflow is
appended to the current slide notes. Empty or underspecified generated tables
are rejected or downgraded to bullets before validation.

Generated decks materialize authored v6 elements and pass `safeParseDeck`
before they are returned.

### Templates And Manual Authoring

Template slides and direct editor commands create current `elements[]`.
Element content edits target `element.content`; formatting edits target
`element.designOverrides`; source actions target `element.source`.

## Editor Open And Sync

`pickFreshestDeck(fetchedRaw, cachedRaw, baseDeck)` chooses the editor seed:

1. freshly fetched server deck;
2. cached last-known deck from the component;
3. freshly derived base deck from the current Lexical state.

Each raw candidate is validated directly with `safeParseDeck`. Serialized JSON
strings are rejected as persisted-schema drift and surfaced by schema audit
rather than parsed at runtime.

The slide editor receives the full current `documentBlocks` list. Text-only
block lists are not used as a substitute for visual/source-ref workflows.

Sync from document uses `mergeDeckFromDocument`:

- document-derived slide elements can be re-materialized from fresh content;
- hand-authored slides preserve elements;
- active `source` elements can refresh content or content hashes in place;
- missing source blocks are surfaced as orphaned/stale links and are not silently
  deleted.

## Persistence And Revision Tokens

Deck saves go through server actions in `src/app/app/documents/[id]/actions.ts`
and service functions in `src/lib/document/persistence-service.ts`.

| Path            | Payload                           | Token                           | Result                                                          |
| --------------- | --------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `saveDeckJson`  | Whole current deck                | Required compare-and-swap token | success, conflict, or validation error                          |
| `saveDeckPatch` | `DeckPatch[]` from slide commands | Required compare-and-swap token | success, conflict, whole-deck retry signal, or validation error |

Missing or stale tokens are conflicts. Successful writes mint a fresh
`deckRevisionToken` and may snapshot a `DocumentVersion` according to the
snapshot throttle.

Unsupported patch replay returns the existing literal `{ ok: "fallback" }` from
the API. That value means "retry with a whole-deck save"; it is not an old-data
compatibility path.

## Render And Export

Rendering and export paths resolve a shared render model from v6 deck state:

- `src/lib/presentation/slide-render-model.ts`
- `src/components/presentation/slide-canvas.tsx`
- `src/lib/presentation/export/deck-export-spec.ts`
- `src/lib/visual/export-preflight.ts`

They do not synthesize elements from flat slide fields at render time.

## Invariants

1. Persisted decks must pass `safeParseDeck`.
2. Persisted slides must carry `elements[]`.
3. Text elements use `content.paragraphs[]` as authoritative text/list content.
4. Source refs must carry explicit `blockKind`.
5. Render/export paths consume the resolved render model.
6. Document sync uses slide/element `source`, not slide-level derived flags.
7. Hand-authored slides preserve their element geometry and style across sync.
8. Deck persistence is guarded by revision-token CAS.

## Primary Tests

- `src/lib/presentation/deck-schema.test.ts`
- `src/lib/presentation/deck.test.ts`
- `src/lib/presentation/deck-layout-assign.test.ts`
- `src/lib/presentation/deck-merge.test.ts`
- `src/lib/presentation/source-link-staleness.test.ts`
- `src/lib/presentation/save-conflict.test.ts`
- `src/lib/presentation/export/deck-export.test.ts`
- `src/lib/visual/export-preflight.test.ts`
