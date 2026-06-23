# ADR: Durable Block Identity and Anchor Contracts

**Status:** Accepted  
**Date:** 2026-06-23  
**Issue:** [#430 — Epic: Durable document-visual identity and anchors](https://github.com/huangyingting/Napkin-Clone/issues/430)  
**Authors:** Switch (Frontend Dev)

---

## Context

Document, visual, slide, and comment identity is currently spread across
multiple entities and eras of data:

- document text blocks were historically addressed through ad-hoc serialized
  Lexical `key` values when available;
- embedded visual blocks use `visualId`;
- mirrored `Visual` rows store `anchorBlockId`;
- slide comments anchor by `slideId` / `elementId`;
- source links use `sourceRef.blockId` plus content hashes.

This works incrementally, but it lacks one stable contract for "what is the
durable identifier of a document block?" Without that contract, duplication,
restore, source-link staleness, and cross-surface anchor resolution all risk
drifting apart.

Epic #430 needs a single rule that lets newer code persist durable block ids
without breaking older serialized content or existing rendering paths.

---

## Decision Drivers

- Backward compatibility is critical: existing `contentJson` and `deckJson`
  must keep loading without an eager migration.
- Anchor resolvers must stay pure so they can run in browser code, server
  actions, and tests.
- Existing rendering and export flows must continue to accept legacy content.
- The solution must fit the current schema: block ids live in serialized
  `contentJson`, not in new database columns.
- Document duplication must produce an independent identity space for the copy.

---

## Decision

**Use `bid` on block-level serialized Lexical nodes as the canonical durable
document-block identifier.**

Rules:

- `bid` is stamped on block-level nodes only: `paragraph`, `heading`, `quote`,
  `horizontalrule`, and `listitem`.
- `key` is **not** the durable contract. It remains a legacy fallback when
  reading older content.
- Container nodes (`root`, `list`) do not carry `bid`.
- Visual nodes keep using `visualId` as their persistent identity.
- Source links use `blockId`, where `blockId === bid` for text blocks and
  `blockId === visualId` for visual blocks.

---

## Entity Inventory

| Entity                | ID field                | Durability                 |
| --------------------- | ----------------------- | -------------------------- |
| Document block        | `bid`                   | Persistent                 |
| Visual node           | `visualId`              | Persistent                 |
| Mirrored `Visual` row | `anchorBlockId`         | Persistent / legacy mirror |
| Slide                 | `id`                    | Persistent                 |
| Slide element         | `id`                    | Persistent                 |
| Comment anchor        | `slideId` / `elementId` | Persistent                 |
| Asset                 | `id`                    | Persistent                 |
| Document version      | `id`                    | Persistent                 |

---

## Lifecycle Rules

| Lifecycle event         | Rule                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Create block            | Stamp a new `bid`                                                                                  |
| Text edit inside block  | Preserve existing `bid`                                                                            |
| Split block             | Surviving block keeps its `bid`; new block gets a new `bid`                                        |
| Merge blocks            | Preserve the surviving block's `bid`                                                               |
| Import Markdown         | Stamp `bid` on every emitted block node                                                            |
| Template / seed content | Stamp `bid` on every emitted block node                                                            |
| Duplicate document      | Regenerate all `bid`s and unlink/remap self-referential source refs into the copy's identity space |
| Copy / paste            | Pasted blocks get new `bid`s                                                                       |
| Restore version         | Keep the restored version's stored `bid`s                                                          |
| Repair legacy content   | Derive current block identity from legacy `key` when `bid` is absent                               |

---

## Backward Compatibility

Nodes without `bid` continue to work.

- Readers must prefer `bid`, then fall back to `key`, then to `undefined`.
- `collectDocumentBlocks` returns `blockId` using:

```ts
blockId = node.bid ?? node.key ?? undefined;
```

- Legacy content remains renderable and exportable even before it is re-saved.

This preserves pre-#432 documents while letting new saves converge on the
durable `bid` contract.

---

## Migration Strategy

Use a **lazy upgrade**:

- new content is stamped immediately;
- existing legacy content is upgraded the first time it is saved or otherwise
  passed through a block-id repair flow;
- no eager database migration is required.

Because `bid` lives inside `contentJson`, the change is additive and does not
require schema changes or bulk rewrites.

---

## Relation to #377 and #380

- **#377 source links:** `sourceRef.blockId` is the durable pointer to the
  source block. For text blocks it resolves to `bid`; for visual blocks it
  resolves to `visualId`.
- **#380 comment anchors:** slide comments do **not** point to document blocks.
  Their durable anchors remain `slideId` / `elementId`, resolved against the
  current deck.

These are complementary contracts: block anchors live in document content,
comment anchors live in slide structure.

---

## Examples

### New paragraph block

```json
{
  "type": "paragraph",
  "bid": "aB3dE6fGhJ7K",
  "children": [{ "type": "text", "text": "Hello", "version": 1 }],
  "direction": null,
  "format": "",
  "indent": 0,
  "textFormat": 0,
  "textStyle": "",
  "version": 1
}
```

### Legacy paragraph block (still readable)

```json
{
  "type": "paragraph",
  "key": "legacy-node-key",
  "children": [{ "type": "text", "text": "Hello", "version": 1 }],
  "direction": null,
  "format": "",
  "indent": 0,
  "textFormat": 0,
  "textStyle": "",
  "version": 1
}
```

### Visual block keeps `visualId`

```json
{
  "type": "visual",
  "visualId": "vis_123",
  "visual": { "...": "..." },
  "version": 1
}
```

### Source ref into a text block

```json
{
  "documentId": "doc_123",
  "blockId": "aB3dE6fGhJ7K",
  "contentHash": "7f44aa12",
  "linkedAt": "2026-06-23T00:00:00.000Z"
}
```
