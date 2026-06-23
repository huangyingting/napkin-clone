# tank-468-persistence: Persistence Hardening & Architecture (#468)

**Author:** Tank  
**Date:** 2026-06-23  
**Issues:** #469, #470, #474, #475, #476  
**Branch:** squad/468-persistence

---

## Summary

Implements the persistence/architecture half of Epic #468: atomic saves, service extraction, collab durability, source-ref model, and architecture docs.

---

## Decision 1 — Atomic Lexical Save (#470)

**Decision:** Accept a caller-supplied `Prisma.TransactionClient` in `mirrorVisualNodesInTx(tx, ...)` and wrap both the `document.updateMany` (contentJson) and `mirrorVisualNodesInTx` in a single `prisma.$transaction()` in `atomicSaveDocumentLexical`.

**Rationale:** Prisma interactive transactions allow multiple operations to share a single transaction boundary. Passing `tx` as the first arg (rather than using module-level prisma calls) keeps the function composable and testable without a real DB — tests can inject a stub `tx` that records calls and optionally throws on the mirror step to verify rollback semantics.

**Alternatives rejected:**
- Two-phase with compensating write: complex, error-prone, doesn't truly atomize.
- Middleware/event-based: too indirect; hard to reason about rollback.

**Test approach:** `makeStubTx()` records all prisma calls; a second variant `makeThrowingMirrorTx()` throws on `visual.deleteMany` to simulate mirror failure and assert that the outer transaction is rolled back.

---

## Decision 2 — Service Extraction (#474)

**Decision:** Create `src/lib/document/persistence-service.ts` containing all persistence orchestration. `actions.ts` becomes thin wrappers: auth/permission checks only, then delegate to service.

**Rationale:**
1. `actions.ts` was ~1300 lines mixing permission checks, business logic, and persistence. Hard to unit test any persistence logic (tied to Next.js server action context).
2. Moving orchestration to a plain TS module makes it importable in tests, background jobs, and future API routes without the Next.js server action overhead.
3. Types like `SaveDeckResult` are re-exported from `actions.ts` for backward compatibility — existing callers import paths are unchanged.

**Service boundary:** The service owns transaction management, mirror reconciliation, deck sanitization, and path revalidation. Server actions own: session/auth, workspace permission checks, and the `revalidatePath` HTTP cache layer.

---

## Decision 3 — Collab Durability (#469)

**Decision:** Add an `onBeforeEvict(roomName, doc)` async callback to `createCollabWss` options. When `evictRoom` fires, if `hasPendingUpdates(doc, savedStateVectors.get(name))` is true, `onBeforeEvict` is called before eviction proceeds. Errors are swallowed so eviction always completes (degraded-safe).

**Rationale:**
- The failure window is: edit synced to Yjs in-memory → collab server restarts before the Next.js autosave fires → edit lost.
- We close this by giving the collab server a hook to flush before eviction; the consumer (lexical-editor integration) can trigger a forced save.
- We don't block eviction on the callback because blocking indefinitely would starve other rooms; we reduce the window, not eliminate it.
- `hasPendingUpdates` is a pure helper (Y.encodeStateVector diff) → easily testable without WebSockets.

**Threading pattern:** `onBeforeEvict` is threaded through `createCollabWss → setupConnection → closeConn/messageListener` rather than stored in a module-level variable, so multiple WSS instances with different callbacks can coexist safely.

**`savedStateVectors` map:** Tracks the last-persisted Y state vector per room. Callers call `setRoomSavedStateVector(room, sv)` after each successful DB write, so `hasPendingUpdates` can compare current state to last-saved.

---

## Decision 4 — Source-Ref Model (#475)

**Decision:** Create `src/lib/document/source-ref-model.ts` as a pure, side-effect-free typed module describing document→deck dependencies. Existing helpers (`stripOrphanedVisuals`, `source-link-staleness`, `anchor-resolver`) are left in place and used by the model; the model provides a unified enumeration + health-check surface.

**Key types:**
- `DocumentDeckDependency`: discriminated union of `visual_element` | `source_ref` deps
- `DependencyHealth`: `healthy` | `stale` | `missing`

**Rationale:** Previously, orphan/staleness/ref logic was scattered across 3+ modules with no shared vocabulary. A central typed model makes it possible to enumerate all deps, check health in one pass, and reconcile consistently. No behavior changes to existing helpers — they still own their repair logic.

---

## Decision 5 — Architecture Docs (#476)

**Decision:** Write `docs/architecture/current-state.md` as a single current-state reference covering all real subsystems. Existing ADRs (`block-anchor-identity-adr`, `slides-persistence-adr`, `visual-mirror-contract`, `command-envelope-spec`, etc.) are referenced and marked as "historical" where the implementation has diverged.

**Rationale:** The ADRs describe decisions, not current behavior. A separate current-state doc lets new contributors quickly orient without sifting through history. The ADRs remain valuable as decision records; the current-state doc is the living reference.

---

## Files Changed

| File | Purpose |
|------|---------|
| `src/lib/document/persistence-service.ts` | #474 service + #470 atomic tx |
| `src/lib/document/persistence-service.test.ts` | Tests for atomicity / rollback |
| `src/app/app/documents/[id]/actions.ts` | Refactored to thin wrappers |
| `scripts/collab-core.mjs` | #469 durability hooks |
| `scripts/collab-durability.test.mjs` | Tests for durability hooks |
| `src/lib/document/source-ref-model.ts` | #475 typed dep model |
| `src/lib/document/source-ref-model.test.ts` | Tests for source-ref model |
| `docs/architecture/current-state.md` | #476 current-state doc |
