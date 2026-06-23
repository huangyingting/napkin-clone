# TextIQ — Current Architecture State

**Status:** Current  
**Date:** 2026-06-23  
**Issue:** [#476 — Refresh architecture docs from current source behavior](https://github.com/huangyingting/Napkin-Clone/issues/476)  
**Authors:** Tank (Backend Dev)

> This document describes the **actual runtime behavior** of the system as of
> the `squad/468-persistence` branch. It is generated from source inspection,
> not from aspirational design. Older ADRs listed at the end are preserved as
> historical context but may describe earlier state.

---

## 1. System Subsystems at a Glance

| Subsystem           | Source of Truth                           | Derived Projections                                               |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Document text       | `Document.contentJson`                    | `Document.content` (plain-text), `Visual` rows                    |
| Slides/deck         | `Document.deckJson`                       | —                                                                 |
| Version history     | `DocumentVersion`                         | —                                                                 |
| Collaboration state | In-memory Y.Doc (collab server)           | Flushed to `Document.contentJson` on client save or room eviction |
| Permissions         | `WorkspaceMembership`, `Document.ownerId` | `requireDocumentCapability` capability cache                      |
| Sharing             | `Document.isShared`, `shareId`, `slug`    | Public URLs `/share/…`, `/embed/…`, `/present/…`                  |
| Command envelope    | `CommandEnvelope` + `CommandBus`          | Applied to `deckJson` via `saveDeckPatch`                         |

---

## 2. Lexical/Yjs Editor

**Source files:**  
`src/app/app/documents/[id]/lexical-editor.tsx`  
`src/lib/collab/use-lexical-collaboration.ts`  
`src/lib/lexical/import-persistence.ts`

### 2.1 Editor state

- `LexicalComposer` initializes from `Document.contentJson` passed as a page prop.
- Block ids (`bid`) are stamped on every paragraph/heading node by `$ensureBlockIdsInDocument`. These ids are durable (survive copy/paste and collab merges) and are the anchor contract for source links, comments, and the visual mirror.
- The editor is in collaborative mode when the Yjs websocket connects. In degraded/offline mode it falls back to local-only editing.

### 2.2 Autosave and CRDT skipping

`shouldAutosaveUpdate` (see `src/lib/lexical/import-persistence.ts`) decides whether an editor change triggers a DB save:

| Tag                   | Autosave? | Reason                                           |
| --------------------- | --------- | ------------------------------------------------ |
| `COLLABORATION_TAG`   | ❌        | Remote CRDT merge — originator saves             |
| `HISTORIC_TAG`        | ❌        | Undo/redo replay                                 |
| `RESTORE_TAG`         | ❌        | Version restore — server action already wrote DB |
| `BLOCK_ID_REPAIR_TAG` | ❌        | Additive identity repair only                    |
| `IMPORT_TAG`          | ✅        | User-initiated content replacement               |
| _(no tag)_            | ✅        | Normal local edit                                |

### 2.3 Durability window and the collab server (#469)

The failure window where a synced edit may not reach the DB:

> Client A edits → Yjs sync to server room → Client A crashes before the
> debounced autosave fires → room is evicted → DB holds pre-edit state.

**Mitigation (implemented in `scripts/collab-core.mjs`):**

- `hasPendingUpdates(doc, lastSavedStateVector)` — pure helper comparing the
  current Yjs state vector against the last durably-saved vector. Returns `true`
  when unsaved operations exist in memory.
- `setRoomSavedStateVector(roomName, stateVector)` — called after a confirmed
  DB write to record the vector at which the room was last saved.
- `onBeforeEvict(roomName, update)` callback — fires with the full Yjs update
  bytes before a room is torn down when unsaved changes are detected. The
  callback is wired at `createCollabWss` time (server.mjs level) and can POST
  to a flush endpoint to persist the update.
- Degraded/offline path: the `CollaborationPlugin` is seeded from `contentJson`
  via `DEGRADED_TIMEOUT_MS` fallback; the degraded flag in
  `useLexicalCollaboration` ensures the editor is not gated on a sync event
  that never arrives.

**Full distributed durability is out of scope.** The window is reduced;
zero-loss delivery is not guaranteed.

---

## 3. Visual Projection (Mirror Pipeline)

**Source files:**  
`src/lib/document/persistence-service.ts` (`mirrorVisualNodesInTx`)  
`src/lib/visual/mirror-diff.ts`  
`src/lib/visual/schema.ts`

### 3.1 Contract

`Document.contentJson` is the source of truth. `Visual` rows are a **derived
projection** used by share pages, embed renders, deck builders, and thumbnails.
No consumer reads `contentJson` directly at render time — they read `Visual` rows.

### 3.2 Atomic save (#470)

`atomicSaveDocumentLexical` in `persistence-service.ts` wraps the `contentJson`
write and the full mirror rebuild in a **single Prisma `$transaction`**:

```
$transaction(async tx => {
  document.updateMany(...)   // writes contentJson + content
  mirrorVisualNodesInTx(tx, documentId, parsedState)  // upserts/deletes Visual rows
})
```

A mirror failure rolls back the `contentJson` write, so DB readers can never
observe `contentJson` that is newer than the `Visual` projection.

### 3.3 Repair path

`rebuildVisualMirror` (server action) / `rebuildMirror` (service) reruns the
mirror pipeline from the current `contentJson` without touching other fields.
Running it twice on identical content is a no-op (idempotent diff).

### 3.4 Belt-and-suspenders reconciliation

After a version restore, `reconcileDeckAfterMirror` re-reads the actual DB
`Visual` rows and strips any `deckJson` references that weren't created by the
mirror. This guards against partial-mirror edge cases.

---

## 4. Slides/Deck Persistence

**Source files:**  
`src/lib/document/persistence-service.ts` (`persistDeck`, `patchDeck`)  
`src/app/app/documents/[id]/actions.ts` (`saveDeckJson`, `saveDeckPatch`)  
`src/lib/presentation/deck-schema.ts`  
`src/lib/presentation/slide-commands.ts`

### 4.1 Storage

`Document.deckJson` holds the entire deck as a single JSON column, separate
from `contentJson`. Deck edits never modify `contentJson` and vice versa.
`Document.deckRevisionToken` is a random token used for optimistic CAS locking.

### 4.2 Write paths

| Action                        | Token check  | Outcome                                   |
| ----------------------------- | ------------ | ----------------------------------------- |
| `saveDeckJson` (full save)    | Optional CAS | `{ ok: true, revisionToken }` or conflict |
| `saveDeckPatch` (incremental) | Required CAS | `{ ok: true }`, conflict, or fallback     |

When `clientToken` is supplied, both write paths use `updateMany` with
`WHERE id = ? AND deckRevisionToken = ?` — no pre-read, no TOCTOU window.

### 4.3 Version snapshots

`snapshotDocumentVersion` captures both `contentJson` and `deckJson` into
`DocumentVersion` after a confirmed write, throttled by `SNAPSHOT_MIN_INTERVAL_MS`.
The maximum snapshot count per document is `MAX_DOCUMENT_VERSIONS`.

---

## 5. Document Persistence Service (#474)

**Source file:**  
`src/lib/document/persistence-service.ts`

Server actions in `actions.ts` are thin wrappers that own:

1. Authentication (`requireUser`)
2. Permission checks (`requireDocumentCapability`)
3. Argument validation (JSON parse, size limits)
4. Cache revalidation (`revalidatePath`)

All persistence orchestration lives in the service:

| Service function            | What it owns                                        |
| --------------------------- | --------------------------------------------------- |
| `atomicSaveDocumentLexical` | Lexical contentJson write + mirror in one tx        |
| `mirrorVisualNodesInTx`     | Mirror pipeline accepting a caller tx               |
| `rebuildMirror`             | Standalone mirror repair                            |
| `persistDeck`               | Full deck CAS write + version snapshot              |
| `patchDeck`                 | Incremental patch apply + CAS write                 |
| `restoreVersion`            | Pre-restore checkpoint + atomic restore + reconcile |
| `sanitizeRestoredDeck`      | Orphan-strip restored deckJson before write         |
| `reconcileDeckAfterMirror`  | Post-mirror deck reconcile against actual DB rows   |
| `revalidateSharePaths`      | Invalidate share/embed/present cache                |

---

## 6. Document-to-Deck Source Reference Model (#475)

**Source file:**  
`src/lib/document/source-ref-model.ts`

Slides can reference document content in three ways:

| Dependency kind | Where                                         | Identified by                               |
| --------------- | --------------------------------------------- | ------------------------------------------- |
| `visual`        | Free-form `SlideElement.kind === "visual"`    | `element.visualId` → `Visual.anchorBlockId` |
| `legacy_visual` | `Slide.visualIds` array (pre-elements schema) | `visualIds[i]` → `Visual.anchorBlockId`     |
| `source_ref`    | `SlideElement.sourceRef` (text or visual)     | `sourceRef.blockId` + `contentHash`         |

`enumerateDeckDependencies(deck)` returns all three kinds in a typed union.
`checkDependencyHealth(deck, freshBlocks)` classifies each as found/stale/missing/invalid.
`reconcileDeckVisuals(deck, knownVisualIds)` delegates to `stripOrphanedVisuals`.
`collectDeckVisualIds(deck)` returns the full set of visual ids the deck needs.

All helpers are pure and side-effect-free.

---

## 7. Collaboration Server

**Source files:**  
`scripts/collab-core.mjs`  
`scripts/collab-server.mjs`  
`server.mjs`  
`src/app/api/collab/authorize/route.ts`

### 7.1 Room lifecycle

```
Connection arrives → cancelEviction(room) → setupConnection
Connection closes  → closeConn → if (conns.size === 0) scheduleEviction(room, TTL, onBeforeEvict)
TTL expires        → hasPendingUpdates? → onBeforeEvict(roomName, update) → evictRoom
```

- **`ROOM_IDLE_TTL_MS`** (default 60 s): how long an empty room stays in memory.
- One `WSSharedDoc extends Y.Doc` per room.
- `docs: Map<string, WSSharedDoc>` — the in-memory room registry.
- `savedStateVectors: Map<string, Uint8Array>` — tracks what has been durably saved per room.

### 7.2 Authorization

`createCollabWss(roomFromUrl, { authorize, onBeforeEvict })` accepts:

- `authorize(req, room)` → `{ ok, status, readOnly? }` — called before WebSocket handshake.
- `onBeforeEvict(roomName, update)` → `Promise<void>` — called with Yjs bytes when a dirty room is evicted.

Read-only connections (viewers) receive sync-step-1 replies but cannot send updates (sync-step-2 / update messages are dropped).

### 7.3 Ping/pong keep-alive

A 30 s ping interval per connection; if pong is not received the connection is closed.

---

## 8. Permissions

**Source files:**  
`src/lib/auth/document-permissions.ts`  
`src/app/api/collab/authorize/route.ts`

Three capability levels, checked via `requireDocumentCapability(userId, documentId, capability)`:

| Capability | Grants       | Who                                                      |
| ---------- | ------------ | -------------------------------------------------------- |
| `"view"`   | Read access  | Owner, workspace members, public share (for shared docs) |
| `"edit"`   | Save edits   | Owner, workspace editors                                 |
| `"manage"` | Share/delete | Owner only                                               |

The collab authorize route maps to `"view"` (read-only) or `"edit"` to set the `readOnly` flag on the WebSocket connection.

---

## 9. Sharing and Export

**Source files:**  
`src/app/app/documents/[id]/actions.ts` (share actions)  
`src/app/share/[...segment]/page.tsx`  
`src/app/embed/[...segment]/page.tsx`  
`src/app/present/[...segment]/page.tsx`

### 9.1 Share link

- `toggleDocumentSharing` generates a `shareId` (12-char URL-safe random) and a decorative `slug` (title-derived + 4-char suffix).
- `regenerateShareLink` rotates both so the old URL stops resolving immediately.
- `updateSharePolicy` sets `shareExpiresAt`, `shareEmbedEnabled`, `sharePresentEnabled`.

### 9.2 Public routes

All three routes (`/share/…`, `/embed/…`, `/present/…`) read `Visual` rows for
thumbnail/visual rendering — they do NOT read `contentJson` directly.

### 9.3 Cache revalidation

`revalidateSharePaths(documentId)` (in `persistence-service.ts`) is called after
version restore so cached public pages reflect the restored content.

---

## 10. Command Infrastructure

**Source files:**  
`src/lib/commands/command-bus.ts`  
`src/lib/commands/command-envelope.ts`  
`src/lib/presentation/slide-commands.ts`

The command bus (`CommandBus`) dispatches `CommandEnvelope` records to registered handlers. Slide deck mutations use `DeckPatch` records applied by `applyPatch` in `patchDeck`. The `saveDeckPatch` server action is the write path for incremental deck updates.

The command bus is in-process; there is no durable command log or event-sourcing layer yet.

---

## 11. Sources of Truth vs. Derived Projections

| Data                | Source of Truth                        | Derived / Projection                     |
| ------------------- | -------------------------------------- | ---------------------------------------- |
| Document body       | `Document.contentJson`                 | `Document.content` (plain-text)          |
| Embedded visuals    | `Document.contentJson` (visual nodes)  | `Visual` rows (mirror projection)        |
| Visual history      | `VisualRevision` rows                  | —                                        |
| Deck/slides         | `Document.deckJson`                    | —                                        |
| Document history    | `DocumentVersion` rows                 | —                                        |
| Collaboration state | In-memory Y.Doc                        | Persisted to `contentJson` on save/evict |
| Block identity      | `bid` fields in Lexical nodes          | `anchorBlockId` in `Visual` rows         |
| Share state         | `Document.isShared`, `shareId`, `slug` | Public URLs                              |

---

## 12. Write Paths

### Supported (current)

- **Lexical autosave** → `saveDocumentLexical` → `atomicSaveDocumentLexical` (contentJson + mirror in one tx)
- **Deck full save** → `saveDeckJson` → `persistDeck` (CAS token)
- **Deck patch save** → `saveDeckPatch` → `patchDeck` (CAS token, incremental)
- **Version restore** → `restoreDocumentVersion` → `restoreVersion` (checkpoint + atomic restore)
- **Mirror rebuild** → `rebuildVisualMirror` → `rebuildMirror` (repair, idempotent)
- **Collab flush on evict** → `onBeforeEvict` callback → flush endpoint (reduces window)

### Legacy / pending migration

- **Full deck save without token** — `saveDeckJson(id, deckJson, null)` still works but does not detect concurrent-write conflicts. New clients always supply a token.
- **Legacy `visualIds` array** — `Slide.visualIds` is still read and reconciled; new slides use the `elements` array.

---

## Historical ADRs

The following ADRs are preserved for historical context. Where behavior
described in them differs from this document, this document is authoritative.

| ADR                            | Status                            | Notes                                                                   |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| `block-anchor-identity-adr.md` | Historical — superseded           | Describes the identity migration; final `bid` stamping is now live      |
| `slides-persistence-adr.md`    | Historical — partially superseded | CAS token and patch path are live; distributed event log is future work |
| `visual-mirror-contract.md`    | Current — details intact          | Still accurate; atomicity detail updated here                           |
| `command-envelope-spec.md`     | Current                           | Command bus is live                                                     |
| `theme-layout-architecture.md` | Current                           | CSS token layer                                                         |
| `mutation-audit.md`            | Current                           | Audit reference                                                         |
| `release-gate.md`              | Current                           | CI gate specification                                                   |
