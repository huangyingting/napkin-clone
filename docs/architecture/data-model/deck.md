# Current Deck Model

**Status:** Current  
**Last updated:** 2026-06-23

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
- `Deck.slides[]` must be present and validated in order.
- Every slide must carry `id`, `index`, `title`, `bullets`, `visualIds`,
  `layout`, `notes`, `theme`, and `elements`.
- `Slide.elements` must be an array. It is the authoritative render/export
  surface.
- `BulletsElement.items[]` is required and carries the authoritative bullet
  content for bullet elements.
- `SourceRef.blockKind` is required and must be either `"text"` or `"visual"`.
- Serialized deck JSON strings are persisted-schema drift, not supported
  persisted input.

There is no deck migration shim. A schema bump means fixtures, generators, and
persisted development data must be updated to the new shape.

## Slide Content Model

### `Slide.elements[]`

`elements[]` is the current slide content model. Renderers, exporters, and the
stage editor consume positioned elements directly.

Supported element kinds are defined in `src/lib/presentation/deck.ts`:

- `placeholder`
- `text`
- `bullets`
- `visual`
- `image`
- `shape`
- `connector`

Each element has stable identity, geometry, z-order, and kind-specific payload.
Element mutations clear `elementsDerived` so later document sync preserves the
authored layout.

### Document-derived metadata

Slides still carry `title`, `titleRuns`, `bullets`, `bulletRuns`, and
`visualIds`. These fields are document-derived metadata used for generation,
sync matching, hashing, and summaries. They are not a fallback render model.

`buildSlideElementsFromContent(slide)` is the only intentional builder from
document-derived slide fields to current elements. It is used when deriving a
new deck or normalizing generated output, not when rendering stored decks.

### Provenance

`elementsDerived` controls sync behavior:

| Value   | Meaning                                                                          | Sync From Document                                     |
| ------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `true`  | Elements were built from document-derived content and have not been hand-edited. | Rebuild elements from fresh document content.          |
| `false` | The slide has been authored by the user or generated as a hand-authored deck.    | Preserve elements and apply only source-ref refreshes. |
| absent  | Treat as hand-authored.                                                          | Preserve elements.                                     |

`sourceSectionId` is a stable heading-derived key used to match document-derived
slides even when the on-slide title has been edited.

## Source References

Slide elements may carry `sourceRef` when they are linked to document text or a
document visual.

```ts
type SourceRef = {
  documentId: string;
  blockId: string;
  contentHash?: string;
  linkedAt: string;
  unlinked?: boolean;
  blockKind: "text" | "visual";
};
```

The block kind is explicit. Refresh, staleness detection, and dependency health
checks never infer a missing kind.

Source-link helpers live in:

- `src/lib/presentation/source-link-staleness.ts`
- `src/lib/document/source-ref-model.ts`
- `src/components/presentation/slide-editor.tsx`

## Deck Creation Paths

### Derive From Document

`buildDeckFromBlocks` converts collected document blocks into slides and calls
`buildSlideElementsFromContent` for positioned elements. Derived slides carry
`elementsDerived: true` so document sync can refresh them later.

### Generate With AI

AI output may be sparse while it is still model output. Before it can be saved or
shown as a deck, `normalizeGeneratedDeck` assigns the current theme/layout and
current elements. Final output must pass `safeParseDeck`.

Generated decks are treated as hand-authored (`elementsDerived: false`) so sync
does not overwrite their layouts.

### Templates And Manual Authoring

Template slides and direct editor commands create current `elements[]` and mark
slides hand-authored. All element add/update/remove/reorder commands preserve
immutability and clear derived provenance for the affected slide.

## Editor Open And Sync

`pickFreshestDeck(fetchedRaw, cachedRaw, baseDeck)` chooses the editor seed:

1. freshly fetched server deck;
2. cached last-known deck from the component;
3. freshly derived base deck from the current Lexical state.

Each raw candidate is filtered by `normalizePersistedDeckJson` from
`src/lib/presentation/persisted-deck.ts` and validated with `safeParseDeck`.
Serialized JSON strings are rejected as persisted-schema drift and surfaced by
schema audit rather than parsed at runtime.

The slide editor receives the full current `documentBlocks` list. Text-only
block lists are not used as a substitute for visual/source-ref workflows.

Sync from document uses `mergeDeckFromDocument`:

- derived slides (`elementsDerived === true`) are rebuilt from fresh content;
- hand-authored slides preserve elements;
- active `sourceRef` elements can refresh content or content hashes in place;
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

Rendering and export paths read `slide.elements` directly:

- `src/components/presentation/slide-canvas.tsx`
- `src/lib/visual/deck-export.ts`
- `src/lib/visual/export-preflight.ts`

They do not synthesize elements from flat slide fields at render time.

## Invariants

1. Persisted decks must pass `safeParseDeck`.
2. Persisted slides must carry `elements[]`.
3. Bullet elements use `items[]` as authoritative content.
4. Source refs must carry explicit `blockKind`.
5. Render/export paths consume elements directly.
6. Document sync only rebuilds derived slides.
7. Hand-authored slides preserve their element geometry and style across sync.
8. Deck persistence is guarded by revision-token CAS.

## Primary Tests

- `src/lib/presentation/deck-schema.test.ts`
- `src/lib/presentation/deck.test.ts`
- `src/lib/presentation/deck-layout-assign.test.ts`
- `src/lib/presentation/deck-merge.test.ts`
- `src/lib/presentation/source-link-staleness.test.ts`
- `src/lib/presentation/save-conflict.test.ts`
- `src/lib/visual/deck-export.test.ts`
- `src/lib/visual/export-preflight.test.ts`
