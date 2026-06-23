# Mutation Audit: Document Visuals and Deck Artifacts

**Status:** Accepted  
**Date:** 2026-06-23  
**Issue:** #437 / Epic #436 — Cross-surface command bus for document visuals and deck artifacts  
**Authors:** Switch (Frontend Dev)

---

## Goal

Inventory every mutation path that touches document visuals, deck artifacts, or
closely-coupled projections so Epic #436 can route **user intent** through one
shared command envelope without forking a second command system.

The command-bus migration rule is:

- keep existing pure deck commands as the deck executor;
- add a pure visual command executor over `src/lib/visual/transforms.ts`;
- leave projection-only and server-only write paths outside the user-intent bus,
  but make them explicit side effects.

---

## Categories

| Category          | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `slide-command`   | Already routed through `executeCommand` / `commitCommand`           |
| `direct-mutation` | Local editor mutation today; candidate to be wrapped by command bus |
| `server-action`   | Server-only persistence / capability-gated mutation                 |
| `projection`      | Derived write; never a user-intent command                          |

---

## Machine-usable inventory

```json
[
  {
    "surface": "document.contentJson",
    "category": "direct-mutation",
    "currentEntryPoints": [
      "src/lib/lexical/insert-visual.ts::$insertBlankVisualAfter",
      "src/app/app/documents/[id]/visual-context-popover.tsx::onChange(node.setVisual via editor.update)",
      "src/app/app/documents/[id]/overall-adjustments-panel.tsx::editor.update",
      "src/app/app/documents/[id]/visual-editor.tsx::onChange"
    ],
    "persistence": "src/app/app/documents/[id]/actions.ts::saveDocumentLexical",
    "busDisposition": "route visual edits through command envelopes before editor.update persists contentJson"
  },
  {
    "surface": "document.visualNode.visual",
    "category": "direct-mutation",
    "currentEntryPoints": [
      "src/app/app/documents/[id]/visual-context-popover.tsx",
      "src/app/app/documents/[id]/visual-editor.tsx",
      "src/app/app/documents/[id]/overall-adjustments-panel.tsx"
    ],
    "persistence": "embedded in Lexical contentJson; mirrored later",
    "busDisposition": "primary new visual command surface"
  },
  {
    "surface": "document.visualMirrorRows",
    "category": "projection",
    "currentEntryPoints": [
      "src/app/app/documents/[id]/actions.ts::mirrorVisualNodes"
    ],
    "persistence": "Visual / VisualRevision rows",
    "busDisposition": "side effect only (visual_mirror_rebuild)"
  },
  {
    "surface": "document.deckJson",
    "category": "slide-command",
    "currentEntryPoints": [
      "src/lib/presentation/slide-commands.ts::executeCommand",
      "src/lib/presentation/slide-commands.ts::commitCommand"
    ],
    "persistence": [
      "src/app/app/documents/[id]/actions.ts::saveDeckJson",
      "src/app/app/documents/[id]/actions.ts::saveDeckPatch"
    ],
    "busDisposition": "wrap existing SlideCommand payloads in CommandEnvelope; do not replace executor"
  },
  {
    "surface": "slide.assets",
    "category": "server-action",
    "currentEntryPoints": [
      "src/app/app/documents/[id]/slide-asset-actions.ts::uploadSlideAsset"
    ],
    "persistence": "Asset rows + storage adapter",
    "busDisposition": "outside user-intent bus for now"
  },
  {
    "surface": "comments.anchors",
    "category": "server-action",
    "currentEntryPoints": [
      "src/app/app/documents/[id]/comments-actions.ts::{createComment,editComment,deleteComment,setCommentResolved}"
    ],
    "persistence": "Comment rows",
    "busDisposition": "future envelope surface; not part of visual/deck executor scope"
  },
  {
    "surface": "slide.element.sourceRef",
    "category": "direct-mutation",
    "currentEntryPoints": [
      "src/components/presentation/slide-editor.tsx::{handleUpdateFromSource,handleUnlinkSource,handleRelinkSource,handleRemoveOrphaned}"
    ],
    "persistence": "saveDeckJson/saveDeckPatch through deckJson",
    "busDisposition": "future deck/source-ref commands; today still direct mutations over deck helpers"
  },
  {
    "surface": "document.versionRestore",
    "category": "server-action",
    "currentEntryPoints": [
      "src/app/app/documents/[id]/actions.ts::restoreDocumentVersion"
    ],
    "persistence": "Document + mirrored Visual rows",
    "busDisposition": "server orchestrated restore, not a user-intent command replay"
  }
]
```

---

## Detailed inventory

### 1. `contentJson` (document editor state)

Current behavior:

- deterministic visual insertion mutates Lexical state inside
  `src/lib/lexical/insert-visual.ts::$insertBlankVisualAfter`;
- visual chrome mutates the selected embedded visual through
  `onChange(transform(...))` → `node.setVisual()` → `editor.update()` in
  `src/app/app/documents/[id]/visual-context-popover.tsx` and
  `src/app/app/documents/[id]/visual-editor.tsx`;
- document-wide theme/brand actions mutate every `VisualNode` inside
  `src/app/app/documents/[id]/overall-adjustments-panel.tsx`.

Persistence remains centralized in
`src/app/app/documents/[id]/actions.ts::saveDocumentLexical`, which stamps block
ids, writes `contentJson`, derives plain text, and then rebuilds visual mirrors.

**Audit decision:** the new command bus should own **visual-intent mutations**
before they are applied into Lexical state, but `saveDocumentLexical` remains the
single persistence path.

### 2. `VisualNode.visual` (embedded visual payload)

This is the core new surface for Epic #436.

Today the visual payload is mutated directly via pure transforms from
`src/lib/visual/transforms.ts`, then written back to the selected Lexical node.
That is already close to command-bus shape: the executor can stay pure and only
needs a shared envelope plus patch / side-effect metadata.

**Audit decision:** route these edits through `src/lib/commands/visual-commands.ts`.

### 3. Mirrored `Visual` rows

`src/app/app/documents/[id]/actions.ts::mirrorVisualNodes` projects embedded
visual blocks from `contentJson` into `Visual` and `VisualRevision` rows for
share/embed, thumbnails, and version history.

This is not user intent.

**Audit decision:** keep it out of the command bus and model it as a
`visual_mirror_rebuild` side effect.

### 4. `deckJson`

Deck mutations already have the right shape:

- `src/lib/presentation/slide-commands.ts::executeCommand` is the pure deck
  executor;
- `commitCommand` is the existing history/autosave adapter;
- `saveDeckJson` and `saveDeckPatch` are the persistence endpoints guarded by
  document capability checks and revision tokens.

**Audit decision:** the new envelope must wrap this layer, not fork it.
`SlideCommand` stays the payload for deck/slide surfaces.

### 5. Slide assets

`src/app/app/documents/[id]/slide-asset-actions.ts::uploadSlideAsset` validates,
deduplicates, stores bytes, and creates `Asset` rows.

**Audit decision:** keep asset upload outside the user-intent bus. It is a
server write with storage side effects, not a pure transform.

### 6. Comments and anchors

`src/app/app/documents/[id]/comments-actions.ts` creates, edits, deletes, and
resolves comment threads while persisting anchor metadata (`slideId`,
`elementId`, geometry, or text/visual anchor fields).

**Audit decision:** comments are a future command-bus surface, but not in scope
for the visual/deck executor introduced in Epic #436.

### 7. Source refs on slide elements

Source-link refresh, unlink, relink, and orphan removal currently happen as
**direct deck mutations** in
`src/components/presentation/slide-editor.tsx::{handleUpdateFromSource,handleUnlinkSource,handleRelinkSource,handleRemoveOrphaned}`.
These use existing deck helpers such as `updateElement`, `removeElement`,
`unlinkSource`, and `relinkSource`, then save through the normal deck save path.

**Audit decision:** this is the main remaining non-command deck mutation path and
should eventually become deck/source-ref commands on top of the existing deck
executor.

### 8. Version restore

`src/app/app/documents/[id]/actions.ts::restoreDocumentVersion` restores
`contentJson` and `deckJson`, re-derives plain text, and rebuilds mirrored
visual rows.

**Audit decision:** keep restore as a privileged server orchestration path. It
replays stored state snapshots, not user-intent commands.

---

## Migration summary

### Route through the new envelope now

- visual styling/layout/content commands over `VisualNode.visual`
- existing `SlideCommand` payloads for `deckJson`

### Explicit side effects, not commands

- visual mirror rebuilds
- source-staleness recomputation
- render invalidation after visual changes

### Out of scope for this epic

- asset uploads
- comment CRUD
- document version restore orchestration
- source-ref deck mutation migration

---

## Key consequence

Epic #436 does **not** introduce a second deck mutation system. Instead it makes
visual edits look like deck edits already do: pure executor + serializable patch
metadata + server-side validation + explicit side effects.
