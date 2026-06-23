# ADR: Slide Deck Persistence and Collaboration Strategy

**Status:** Accepted  
**Date:** 2026-06-22  
**Issue:** [#376 — Epic: Slide and element persistence plus collaboration strategy](https://github.com/huangyingting/Napkin-Clone/issues/376)  
**Authors:** Switch (Frontend Dev), Trinity (Architecture)

---

## Context

The Napkin slide editor stores its entire deck as a single `deckJson` JSON
column on the `Document` row. A `saveDeckJson` server action validates the
payload against the current deck schema and overwrites the column in place.
`DocumentVersion` snapshots periodically copy `deckJson` alongside
`contentJson`, giving a coarse version history.

This model is correct for single-user editing and small decks. It has three
structural gaps that will block future features:

1. **Last-writer-wins.** Concurrent saves from two browser tabs, or two users
   with edit access, silently overwrite each other. There is no revision token
   to detect a stale write.
2. **Whole-deck transfer cost.** Every autosave sends and validates the entire
   deck, including slides the user did not touch. At 50+ slides this becomes a
   measurable round-trip.
3. **No collaboration model for slides.** The rich-text layer uses Lexical/Yjs
   for real-time co-editing. The slide layer has no equivalent — presence,
   cursor positions, and element-level locking are undefined.

Before implementing any of the remaining child issues (conflict detection,
patch save, presence), the team needs a shared decision on the target
architecture and a staged rollout path.

---

## Decision Drivers

- Must not break existing `deckJson` data. Decks that were saved without a
  revision token must load without error.
- Autosave must remain low-latency from the user's perspective (no blocking
  wait for conflict resolution in the happy path).
- Must give users a clear recovery path when a conflict is detected, not a
  silent overwrite.
- Must integrate with the existing `DocumentVersion` snapshot model.
- Should not require a realtime transport (WebSocket) to gain conflict safety;
  realtime collaboration is a later opt-in layer.
- Implementation should be incremental: each child issue must ship a fully
  working, independently deployable increment.

---

## Options Considered

### Option A — Optimistic Revision Token (selected)

Add a monotonically-increasing integer `deckRevision` to the `Document` row and
mirror it inside the serialized `Deck` payload as `rev`. `saveDeckJson` compares
the client's `rev` against the database value before writing:

- `client.rev === db.deckRevision` → accept; increment `deckRevision`;
  return new `rev` to the client.
- `client.rev < db.deckRevision` → reject with HTTP 409 / action error
  `"deck_conflict"`; return the current server deck so the client can present a
  recovery UI.

**Pros:**

- Zero additional infrastructure. Works with the existing PostgreSQL/SQLite
  setup and Prisma transactions.
- Round-trip is a single row read + conditional write (compare-and-swap).
- Incrementally adoptable: existing clients without `rev` receive the new token
  on next load and start sending it thereafter.

**Cons:**

- Still a whole-deck write per save. Addressed in a later child issue (patch
  save API).
- Two tabs owned by the same user are equally capable of triggering a conflict.
  The UX must handle self-conflicts gracefully.

### Option B — Slide-Level Patch Save

Replace the whole-deck write with a sequence of slide-level JSON-patch
operations (`RFC 6902`). The server applies patches to the stored deck and
records each operation in a `DeckPatch` log table.

**Pros:**

- Efficient for large decks (only changed slides travel the wire).
- Patch log enables fine-grained audit and potential rewind.

**Cons:**

- Significantly more complex server-side merge logic. Concurrent patches to
  the same slide still need a conflict resolution rule.
- Requires schema migration and a new API surface before any user benefit is
  visible.
- Premature optimisation for the current deck size range.

**Decision:** Implement as a follow-on to Option A (child issue: "Prototype
patch-based save for slide/element edits"). Option A unlocks conflict safety
immediately; Option B optimises throughput once the conflict model is proven.

### Option C — CRDT / Yjs for the Slide Deck

Represent the deck as a Yjs `Y.Doc`, synchronise it through the existing
collaboration server, and persist the Yjs binary state.

**Pros:**

- True multi-user real-time collaboration with automatic merge.
- Presence and element-level cursors fall out of the Yjs awareness protocol.

**Cons:**

- The collaboration server is single-instance, in-memory, and optimised for
  the Lexical document room. Reusing it for decks without horizontal-scaling
  work adds risk.
- Yjs binary state is opaque to SQL queries, backup tools, and the existing
  migration pipeline.
- Non-goals: the epic explicitly defers fine-grained multi-cursor editing until
  the persistence strategy is settled.

**Decision:** Defer. After Option A and B are stable, evaluate CRDT as an
opt-in collaboration tier. The `deckRevision` token does not conflict with a
future Yjs layer — the two can coexist (Yjs manages in-session sync; the token
guards async saves).

### Option D — Hybrid (Snapshot + Command Log)

Store a periodic full snapshot plus an append-only command log of user
actions. Replay the log on top of the snapshot to reconstruct current state.

**Pros:** Enables undo/redo across sessions; audit trail.

**Cons:** Requires a command schema for every deck mutation. Very high
up-front complexity; out of scope for this epic.

---

## Decision

**Adopt Option A (Optimistic Revision Token) as the canonical persistence
strategy for Slides, with Option B (Patch Save) as the planned next layer.**

The rationale:

- Conflict safety is the highest-priority gap; Option A closes it in one
  incremental PR.
- The approach requires no new infrastructure, no new tables (revision counter
  is a single integer column), and no changes to the deck schema beyond
  stamping a `rev` field.
- Option B is architecturally additive — the revision token remains the
  source-of-truth guard even when patch saves replace whole-deck writes.
- Option C (Yjs) remains a valid long-term direction but must not block the
  near-term conflict-safety goal.

---

## Entity Identity Rules

Before implementing patch saves or presence, every addressable object needs a
stable, globally unique identifier. Current state and rules:

| Entity                 | ID field                  | Current state                           | Rule                                                                     |
| ---------------------- | ------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| `Deck`                 | `Document.id` (inherited) | ✓ stable CUID                           | No change needed                                                         |
| `Slide`                | `slide.id`                | Present (`makeSlideId()`, nanoid-based) | **Must be stable across saves** — never regenerate on load or migration  |
| `SlideElement`         | `element.id`              | Present in schema                       | **Must be stable** — regeneration breaks patch targeting and undo stacks |
| `Layout`               | n/a (enum value)          | Not an entity                           | No ID needed                                                             |
| `Asset` (image, video) | `asset.storageKey`        | Stable content-addressed key            | No change needed                                                         |
| `Comment`              | `Comment.id` (Prisma)     | ✓ stable CUID                           | No change needed                                                         |

**Invariant:** `slide.id` and `element.id` values written to the database must
never change for the lifetime of the slide or element. Code that generates
fresh IDs (e.g., `makeSlideId()`) must only be called when creating a new
slide, never when loading or re-serialising an existing one.

---

## Staged Implementation Plan

### Stage 1 — Deck Revision Token and Save Conflict Detection (child issue 376-2)

**Scope:** Backend-only. No UI change except a conflict error state on
autosave failure.

1. Add `deckRevision Int @default(0)` to the `Document` model in **both**
   `prisma/schema.prisma` (PostgreSQL) and `prisma/schema.sqlite.prisma`
   (SQLite/dev). Run `prisma migrate dev` for each schema to generate matching
   migration files in `prisma/migrations` and `prisma/migrations-sqlite`.
2. Update `saveDeckJson` to accept an optional `clientRev: number` parameter.
3. Implement the compare-and-swap (CAS) using one of the two concrete
   approaches — pick the one that fits the call site:
   - **Preferred — `updateMany` CAS:** call
     `prisma.document.updateMany({ where: { id, deckRevision: clientRev } })`
     and check `result.count === 0`; if zero rows were updated, a concurrent
     write changed the revision first — read the current row and return a
     conflict result.
   - **Alternative — explicit transaction:** wrap a `findUnique` + `update`
     in `prisma.$transaction([ … ])` so the read and write are atomic.
     Either approach is acceptable; the ADR does not prescribe which, but the
     chosen mechanism **must** be documented in the implementation PR.
   - `saveDeckJson` currently has **no** transaction; one must be added as
     part of this stage.
4. The return type of `saveDeckJson` is a discriminated union — define it as:
   ```ts
   type SaveDeckResult =
     | { ok: true; rev: number }
     | { ok: "conflict"; serverDeck: string; serverRev: number };
   ```
   This shape is intentionally distinct from the existing `ActionResult`
   wrapper so callers can pattern-match on `ok` without ambiguity. The
   existing `ActionResult` error path is preserved for unexpected/server
   errors; `SaveDeckResult` is only returned when the save itself completes
   (with or without a conflict).
5. Return `{ ok: true, rev: newRev }` on success so the client can update its
   local `rev` without a separate fetch.
6. The `Deck` TypeScript type gains an optional `rev?: number` field. The
   schema validator (`parseDeck` / `safeParseDeck`) accepts but does not
   require it. `saveDeckJson` strips `rev` from the payload before persisting
   (the canonical revision lives in the `deckRevision` DB column, not in the
   JSON blob).
7. Existing saves without `clientRev` continue to work (no revision check) —
   backward compatible.
8. The slide editor's autosave hook reads the initial `rev` from
   `getDeckJson`'s response and threads it through each `saveDeckJson` call.

**Conflict response size note:** On a 50-slide deck the `serverDeck` payload
returned in a conflict response may be 200–500 KB. This is acceptable for an
occasional recovery path; if benchmarks show it is a problem, a follow-on can
return only the conflicting slide IDs and fetch full slides on demand.

**Migration:** Additive — `deckRevision Int @default(0)` adds a column with a
default value; no existing rows change. Existing documents start with
`deckRevision = 0`; clients that load them receive `rev: 0` and begin tracking
from that point. Apply to both Prisma schema files before merging.

**Test targets:**

- Unit: `saveDeckJson` returns `{ ok: "conflict", serverDeck, serverRev }` when
  `clientRev` does not match the current `deckRevision`.
- Unit: `saveDeckJson` returns `{ ok: true, rev }` and increments `deckRevision`
  on a successful write.
- Unit: `saveDeckJson` accepts writes when `clientRev` is absent (legacy path).
- Concurrency: two parallel `saveDeckJson` calls with identical `clientRev`
  result in exactly one success and one conflict (validates CAS atomicity; use
  `Promise.all` in test with a real or transactional test DB).

---

### Stage 2 — Conflict Recovery UI (child issue 376-4)

**Scope:** Client-only. Triggered by a `deck_conflict` response from Stage 1.

1. The autosave hook catches `deck_conflict` and stores the in-flight local
   deck alongside the server's returned deck.
2. A non-blocking toast/banner appears: _"Your slide changes conflict with
   changes from another session. [Keep mine] [Use theirs] [Compare]"_.
3. "Keep mine": re-submit the local deck with the server's current `rev` (force
   write). The server accepts because `clientRev === serverRev` at that moment.
4. "Use theirs": replace the client's deck state with `serverDeck`; discard
   local changes.
5. "Compare": show a side-by-side slide list modal (thumbnails only); user can
   cherry-pick individual slides from either version.
6. The same flow applies to self-conflicts (same user, two tabs).

**No schema changes.** Pure React state and the `SaveDeckResult` return type
defined in Stage 1.

**Test targets:**

- Component: conflict toast/banner renders when autosave hook receives
  `{ ok: "conflict" }`.
- Component: "Keep mine" path re-submits local deck with updated `rev` and
  closes the banner on `{ ok: true }`.
- Component: "Use theirs" path replaces editor state with `serverDeck` and
  discards local changes.
- Integration: force-write after conflict resolution — after a user chooses
  "Keep mine", the subsequent save must succeed (i.e., `clientRev` now matches
  `serverRev` that was returned in the conflict response).

---

### Stage 3 — Patch Save API for Slide/Element Edits (child issue 376-3)

**Scope:** API and client. Reduces wire size for large decks.

1. Define a `DeckPatch` type: a discriminated union of operations —
   `insert-slide`, `delete-slide`, `move-slide`, `update-slide` (full slide
   payload), `update-element` (element id + delta), `update-deck-meta`.
2. Add `PATCH /api/documents/[id]/deck` route that accepts an array of
   `DeckPatch` operations and a `clientRev`. Server applies operations to the
   stored deck inside a transaction, using the same revision-check guard from
   Stage 1.
3. The slide editor accumulates patches between autosave ticks. On tick,
   flush the patch queue; on conflict, fall back to Stage 2 recovery UI.
4. Whole-deck save (`saveDeckJson`) remains available as a fallback (initial
   load, force-write after conflict resolution, version restore).

**Backward compatibility:** Clients without patch support continue using
`saveDeckJson`. The patch endpoint is additive.

**Test targets:**

- Unit: each `DeckPatch` operation type (`insert-slide`, `delete-slide`,
  `move-slide`, `update-slide`, `update-element`, `update-deck-meta`) produces
  the correct mutated deck (pure reducer tests, no DB).
- Integration: `PATCH /api/documents/[id]/deck` returns 200 with updated `rev`
  on a valid patch sequence against a test DB.
- Integration: `PATCH` with a stale `clientRev` returns a `deck_conflict`
  result (same shape as Stage 1).
- Partial-failure rollback: if one patch operation in a batch is invalid
  (e.g., references a non-existent element ID), the entire transaction rolls
  back and the deck remains unchanged.

---

### Stage 4 — Presence Model for Slide Editor Sessions (child issue 376-6)

**Scope:** Realtime awareness only. No merge logic.

1. Use the existing Yjs awareness channel (already open for the text
   layer) to broadcast slide editor presence:
   - `{ userId, displayName, avatarUrl, deckId, slideIndex, elementId | null }`.
2. The slide editor currently does not receive the Yjs `provider` or
   `awareness` object. The implementation **must** explicitly thread the
   provider/awareness instance down from the document page component into the
   slide editor component (e.g., via a context or prop). Do not assume the
   slide editor has ambient access to the collaboration provider.
3. The slide editor renders presence indicators: avatar stack on the slide
   panel (who is on this slide), a subtle highlight ring on elements being
   edited by another user.
4. **No locking.** Presence is advisory. Conflicts are handled by the
   revision-token flow, not by preventing concurrent edits.
5. Slide-level presence data is ephemeral (in-memory awareness); it is not
   persisted.

**Dependency:** Requires the collaboration server to be reachable from the
slide editor page. Currently conditional on `appEnv.collabUrl`; presence
degrades gracefully (no indicators) when the collab server is absent.

**Test targets:**

- Unit: awareness update with the correct presence shape is emitted when the
  active slide index changes (Vitest + mock Yjs provider).
- Unit: presence indicators render correctly given a mock awareness state with
  multiple users on the same slide.
- Graceful degradation: when `appEnv.collabUrl` is absent or the provider is
  unavailable, the slide editor renders without presence indicators and without
  throwing (no uncaught errors).
- Self-conflict awareness: when the same user has two tabs open, both tabs
  show the user's own presence entry; the conflict recovery UI (Stage 2) still
  triggers correctly on a revision mismatch.

---

### Stage 5 — Version Restore Semantics for Decks (child issue 376-5)

**Scope:** Server action changes only.

Current behaviour: `restoreDocumentVersion` copies `version.deckJson` back to
`Document.deckJson` without further checks.

Required changes:

1. Before restoring, call the existing `sanitizeRestoredDeck` to strip
   visual references that no longer exist in the restored `contentJson`.
   Verify that `sanitizeRestoredDeck` handles **all** element types present in
   the schema (text, image, video, shape, etc.) — add coverage for any element
   type not yet exercised in tests.
2. After restoring, set `Document.deckRevision` to `currentRev + 1` so any
   in-flight client save with the old `rev` is detected as a conflict.
3. Asset references in the restored deck that point to deleted or
   inaccessible storage keys are rewritten to a placeholder element so the
   deck renders without broken images.
4. Add a forced `DocumentVersion` snapshot immediately before the restore
   (already the current behaviour via `force: true` in `shouldSnapshot`) so
   the user can undo the restore itself.

**Test targets:**

- Integration: restored deck passes `safeParseDeck` and `deckRevision` is
  incremented by 1 (against a test DB with a seeded version row).
- Unit: `sanitizeRestoredDeck` correctly strips element types for all known
  element variants (text, image, video, shape); add a test case per element
  type that has a cross-reference into `contentJson`.
- Unit: pre-restore snapshot is created before the restore operation completes
  (assert that `DocumentVersion` row count increases by 1).
- Unit: inaccessible asset keys in the restored deck are replaced with the
  expected placeholder element shape, not left as dangling references.

---

## Validation and Test Strategy

| Layer                        | What to test                                                                                                               | Approach                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `saveDeckJson`               | Revision increment, conflict detection, missing-rev backward compat                                                        | `node:test` unit tests (no DB: mock Prisma tx)                          |
| `saveDeckJson` CAS           | Two parallel saves with same `clientRev` yield exactly one success + one conflict                                          | Concurrency integration test against a real/test-transaction DB         |
| Patch apply                  | Each `DeckPatch` operation mutates deck correctly                                                                          | Pure-function unit tests on the patch reducer                           |
| Patch endpoint               | Valid patch increments `rev`; stale `clientRev` returns conflict; partial batch rolls back                                 | Integration tests against test DB (`PATCH /api/documents/[id]/deck`)    |
| Conflict recovery UI         | Toast appears on `deck_conflict`; each resolution path updates state correctly                                             | React Testing Library component tests                                   |
| Force-write after resolution | "Keep mine" re-submit with updated `rev` succeeds                                                                          | Integration test: conflict → resolution → next save OK                  |
| Presence broadcast           | Awareness updates are sent/received with correct shape; degrades gracefully without provider                               | Vitest + mock Yjs provider                                              |
| Self-conflict                | Same user with two tabs still triggers conflict UI on revision mismatch                                                    | Unit test with mock awareness + two simulated autosave hooks            |
| Version restore              | Restored deck passes `safeParseDeck`; `deckRevision` incremented; pre-restore snapshot created; asset placeholders applied | Integration test against test DB                                        |
| `sanitizeRestoredDeck`       | All element types (text, image, video, shape) are handled                                                                  | Unit tests per element type                                             |
| Backward compat              | Decks saved before `rev` field exist load and save without errors                                                          | Unit test: `saveDeckJson` without `clientRev` succeeds                  |
| E2E smoke                    | Conflict detection → user resolves via "Keep mine" → subsequent autosave succeeds without conflict                         | Playwright test: open two tabs, edit in both, resolve conflict in tab 1 |

All tests must pass in CI before a child issue PR is merged to `dev`.

---

## Migration and Backward Compatibility

| Change                           | Risk                                                                                                                                | Mitigation                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Add `deckRevision` column        | Additive migration, default `0`; applies to both `prisma/schema.prisma` (PostgreSQL) and `prisma/schema.sqlite.prisma` (SQLite/dev) | No existing row changes; Prisma `@default(0)` handles it; run migrations for both schemas |
| `rev` field in `Deck` JSON       | Optional field; validator accepts absent                                                                                            | `safeParseDeck` treats absent `rev` as legacy; no migration of stored JSON needed         |
| `PATCH /deck` endpoint           | New route, no existing route changed                                                                                                | Clients without patch support are unaffected                                              |
| Revision check in `saveDeckJson` | Only applied when `clientRev` is sent                                                                                               | Old clients (no `clientRev`) bypass the check — zero breakage                             |
| Presence awareness shape         | New awareness state key (`deckPresence`)                                                                                            | Ignored by text-layer awareness handlers; no conflict                                     |

No existing `deckJson` column data needs to be rewritten. The `schemaVersion`
migration boundary (`CURRENT_DECK_SCHEMA_VERSION`) is independent of the
revision token — schema migrations and revision tracking are orthogonal
concerns.

---

## Open Questions

1. **Should the deck become a separate `Deck` table?** Not required for
   Stages 1–3. Revisit if patch-save log retention or multi-deck-per-document
   becomes a goal.
2. **Offline reconciliation.** When a user edits offline and comes back online
   with a stale `rev`, the conflict UI is the recovery path. A more
   sophisticated merge (three-way diff at slide level) is deferred.
3. **Patch granularity for elements.** Stage 3 defines `update-element` as a
   full element payload replacement. True field-level diff (e.g., only `x`,
   `y` changed) is a further optimisation deferred to a follow-on.
4. **Yjs for deck.** Remains a valid future direction. The revision-token
   model and a future Yjs layer are composable: Yjs manages in-session sync
   (fast path); the revision token guards async persistence (slow path).

---

## Consequences

- **Positive:** Concurrent saves can no longer silently overwrite each other.
  Users see an explicit recovery choice rather than losing work.
- **Positive:** The incremental plan lets each child issue ship independently
  with measurable, user-visible value at each stage.
- **Positive:** No new infrastructure is required for Stages 1–3.
- **Neutral:** Clients must track and send `rev` on every autosave. The slide
  editor's autosave hook gains one additional state variable.
- **Negative (accepted):** Whole-deck writes continue until Stage 3. Large
  decks (50+ slides) will benefit most from Stage 3 and should be tested with
  realistic payloads before that PR ships.

---

## Implementation Status (Epic #376 child issues)

This section documents the as-implemented behaviour for issues #403–#407,
superseding the ADR's earlier Stage descriptions where they differ.

### #403 — Patch-Based Save (`saveDeckPatch`)

**Status:** Implemented in `src/app/app/documents/[id]/actions.ts`.

`saveDeckPatch(id, patches, clientToken)` accepts an array of `DeckPatch`
records (the same format emitted by `executeCommand` / `commitCommand` from
`slide-commands.ts`). It:

1. Reads the stored deck and revision token in one query.
2. Checks `clientToken` against `document.deckRevisionToken`. Stale token →
   `{ ok: "conflict", serverRevisionToken }`.
3. Applies each patch in sequence via `applyPatch()`. If any patch returns
   `null` (unsupported op or missing payload) the action returns
   `{ ok: "fallback" }` so the caller can retry with a whole-deck save.
4. Validates the resulting deck with `safeParseDeck`. Invalid result →
   `{ ok: false, error }`.
5. Atomic CAS write: `updateMany` keyed on `{ id, deckRevisionToken: clientToken }`.
   A zero count is re-resolved as conflict or deleted-document.
6. On success: calls `snapshotDocumentVersion` (throttled, same as
   `saveDeckJson`), returns `{ ok: true, revisionToken }`.

**Patch saves do NOT create `DocumentVersion` snapshots on conflict or
fallback.** The snapshot call is only reached after a confirmed write
(`count > 0`), identical to the whole-deck save path.

**`saveDeckJson` is unchanged and remains the canonical fallback.** The patch
endpoint is additive and does not break existing autosave flows.

### #404 — Conflict Recovery UX

**Status:** Implemented in `src/components/presentation/conflict-recovery-dialog.tsx`
and wired in `src/components/editor/slide-editor-button.tsx`.

When `saveDeckJson` returns `{ ok: "conflict" }` the `SlideEditorButton`
component now:

1. Stores the local deck snapshot and the server's current revision token in
   `conflictState`.
2. Renders a `ConflictRecoveryDialog` modal (distinct from a generic error
   banner — see acceptance criterion).
3. **Keep my version:** calls `saveDeckJson` with the server's current token
   as `clientToken`, forcing the write through. On success the revision token
   ref and `lastSavedRef` are updated; the dialog closes.
4. **Use server version:** fetches the latest deck from the server via
   `fetchDeckJson`, updates the editor's deck state, and discards local
   changes.
5. **Dismiss:** closes the dialog; unsaved changes remain in the editor (the
   user can retry manually).

Self-conflict (same user, two tabs) is handled identically — the dialog copy
does not assume the conflict originated from a different user.

The editor updates its revision token after every successful recovery so the
next autosave uses the current server token.

### #405 — Autosave and Snapshot Semantics

**Autosave flow:**

1. `SlideEditor` debounces edits (~1.5 s). On tick, calls `onSave(deck)`.
2. `SlideEditorButton.handleSave` calls `saveDeckJson(id, deck, revisionTokenRef.current)`.
3. On `{ ok: true }`: updates `revisionTokenRef` and `lastSavedRef`; clears
   the dirty flag.
4. On `{ ok: "conflict" }`: opens `ConflictRecoveryDialog`; returns
   `{ ok: false, error }` to the save-status badge.
5. On `{ ok: false }`: surfaces the error via the save badge; Retry calls
   `flushSave()` again.

**`DocumentVersion` snapshot semantics:**

| Event                                        | Snapshot created?                                               |
| -------------------------------------------- | --------------------------------------------------------------- |
| Successful `saveDeckJson` (whole-deck)       | Yes — after confirmed `updateMany` (`count > 0`)                |
| Successful `saveDeckPatch` (patch save)      | Yes — same guard (`count > 0`)                                  |
| Conflicted `saveDeckJson` or `saveDeckPatch` | **No** — `count === 0` → early return before snapshot call      |
| `saveDeckPatch` fallback (unsupported op)    | **No** — returns `ok: "fallback"` before any write              |
| Forced restore (`restoreDocumentVersion`)    | Yes — pre-restore `force: true` snapshot then the restore write |
| Retry after conflict recovery (keep mine)    | Yes — the re-save is a normal `saveDeckJson` call               |

Snapshots are throttled by `shouldSnapshot` (10-minute minimum interval) and
pruned to `MAX_DOCUMENT_VERSIONS` (15 entries). `force: true` bypasses
throttle (used for version restore pre-checkpoint only).

Patch saves use the same snapshot policy as whole-deck saves: one coalesced
snapshot per 10-minute window, not one snapshot per patch. A high-frequency
patch stream therefore produces the same number of snapshot entries as a
high-frequency whole-deck autosave stream.

### #406 — Slide Editor Presence Model

**Status:** Implemented in `src/lib/presentation/use-slide-presence.ts`.

**Payload shape** (`SlidePresencePayload`):

```ts
interface SlidePresencePayload {
  documentId: string;
  userName: string;
  userId: string;
  selectedSlideId: string | null;
  selectedElementIds: string[];
  editingMode: "browsing" | "selecting" | "editing";
}
```

**Transport:** Reuses the existing Yjs `WebsocketProvider` awareness channel.
Slide presence is keyed under `"deckPresence"` in the awareness state map,
keeping it invisible to the text-layer awareness handlers (which read only
`name` / `color` at the top level).

**Offline/local-only degradation:** When `awareness` is `null` / `undefined`
the hook returns an empty `peers` array and does not attempt any network
traffic. The local payload is always available regardless of connectivity.

**Rendering contract:** The UI MUST NOT imply real-time collaborative editing.
Presence shows who else has the deck open and which slide they are viewing —
it does not guarantee that remote edits are automatically merged. Conflicts are
handled by the revision-token CAS path, not by presence locking.

### #407 — Save-Conflict and Non-Conflicting Edit Tests

**Status:** Implemented in `src/lib/presentation/save-conflict.test.ts`
and `src/lib/presentation/use-slide-presence.test.ts`.

Coverage:

| Test                                                                | Location                     |
| ------------------------------------------------------------------- | ---------------------------- |
| `saveDeckJson` success-with-token (matching tokens → no conflict)   | `save-conflict.test.ts`      |
| Stale-token conflict (different tokens → conflict)                  | `save-conflict.test.ts`      |
| Legacy (no clientToken) → always succeeds                           | `save-conflict.test.ts`      |
| Conflicted save does NOT create version snapshot (`count=0` guard)  | `save-conflict.test.ts`      |
| Successful save → snapshot policy says yes                          | `save-conflict.test.ts`      |
| `applyPatch` round-trip for `slide.update_title`, `deck.set_theme`  | `save-conflict.test.ts`      |
| Two non-conflicting patches on separate slides succeed sequentially | `save-conflict.test.ts`      |
| Same-slide conflict: stale token detected by `isRevisionConflict`   | `save-conflict.test.ts`      |
| `applyPatch` returns `null` for unsupported ops (fallback trigger)  | `save-conflict.test.ts`      |
| `safeParseDeck` validates / rejects decks (schema end-to-end)       | `save-conflict.test.ts`      |
| Presence payload derivation                                         | `use-slide-presence.test.ts` |
| Presence peer extraction, sorting, local/remote marking             | `use-slide-presence.test.ts` |
| Offline fallback: empty peers, local payload available              | `use-slide-presence.test.ts` |
