# Migration and Backfill Dry-Run Plan

**Epic:** #455 — System stabilization and release readiness for document visuals  
**Issue:** #457  
**Coordinates with:** #430 (block-anchor identity), #448 (visual projection repair)

---

## Overview

This document defines the dry-run plan for safely backfilling durable block
ids into legacy `contentJson` and rebuilding Visual mirror rows for documents
that pre-date the identity (#430) and projection repair (#448) changes.

**The guiding principle:** a migration must be safe to abort, safe to
re-run (idempotent), and must not silently alter data without a dry-run
report first.

---

## 1. Data inventory

### 1.1 Block identity (`contentJson.bid` fields — issue #430)

| Field                     | Location                                   | Migration need                                                             |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `bid` on block nodes      | `Document.contentJson` → Lexical node tree | Absent on pre-#430 saves; must be stamped lazily or in a batch             |
| Legacy `key` fallback     | Same nodes                                 | Read-only fallback; never written; safe to ignore post-migration           |
| `Document.contentJson`    | Prisma `Document` table                    | Updated in-place; idempotent via `stampBlockIds`                           |
| `DocumentVersion.content` | Prisma `DocumentVersion` table             | Historical snapshots; bid stamping is NOT applied here (preserves history) |

### 1.2 Visual mirror rows (`Visual` table — issue #448)

| Field                    | Location                                        | Migration need                                                     |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| `Visual.anchorBlockId`   | Prisma `Visual` table                           | Must match a live `bid` in `contentJson`; stale after regeneration |
| `Visual.data`            | Same                                            | Must pass per-kind schema validation                               |
| Deck `visualIds`         | `Document.deckJson` → `Deck.slides[].visualIds` | Must reference existing Visual ids                                 |
| `VisualRevision` history | Prisma `VisualRevision` table                   | Historical; not migrated, preserved as-is                          |

### 1.3 Other fields affected

| Field                                     | Risk level | Notes                                       |
| ----------------------------------------- | ---------- | ------------------------------------------- |
| `sourceRef` on slide elements             | Low        | Metadata-only; unlinked refs are inert      |
| `VisualNode.anchorBlockId` in live editor | Low        | Derived from `bid` at render time           |
| Comment anchors (`commentAnchorId`)       | Medium     | Anchored to `bid`; stale after regeneration |
| Asset links (`assetId`)                   | Low        | Not affected by block-id migration          |

---

## 2. Migration classes

### Class A: Stamp missing block ids (lazy, safe)

**Trigger:** Document opened for editing / saved for the first time post-#430.  
**Mechanism:** `stampBlockIds(contentJson)` in `saveDocumentLexical` before write.  
**Idempotent:** Yes — nodes that already have `bid` are unchanged.  
**Reversible:** Not needed — adding `bid` never removes information.  
**Risk:** None for new bids. Zero risk of data loss.

### Class B: Rebuild Visual mirror (repair action)

**Trigger:** Explicit `rebuildVisualMirror(documentId)` call (owner/editor only).  
**Mechanism:** Reads `contentJson`, re-runs `diffVisualMirror`, applies the plan.  
**Idempotent:** Yes — running twice on unchanged content produces a no-op diff.  
**Reversible:** Via `VisualRevision` history (each payload change is snapshotted).  
**Risk:** Orphaned rows are deleted; out-of-sync rows are updated. A `dry-run`
mode (see §3) must be run first for any broad/scripted rebuild.

### Class C: Deck visual reference repair (requires human decision)

**Trigger:** `deckJson` references a `visualId` that no longer exists in the
`Visual` table (e.g. after a rebuild that deleted the row).  
**Mechanism:** `stripOrphanedVisuals` in `actions.ts` removes stale ids.  
**Idempotent:** Yes.  
**Reversible:** `DocumentVersion` snapshots allow restore. Before any broad
repair, a dry-run report must be reviewed.  
**Risk:** Medium — removing a `visualId` from a slide is visible to the user.

---

## 3. Dry-run output specification

A dry-run run reports **what would change** without writing anything. The
output is structured JSON (one object per document) with the following fields:

```ts
interface DryRunDocumentReport {
  /** Document id. */
  documentId: string;

  // --- Block identity ---
  /** Number of block nodes that are missing a 'bid' and would be stamped. */
  missingBidCount: number;
  /** Number of block nodes that already have a 'bid' (no change needed). */
  existingBidCount: number;
  /** Whether any two nodes share the same 'bid' (duplicate — unsafe). */
  hasDuplicateBids: boolean;
  /** List of duplicate bids (empty when hasDuplicateBids = false). */
  duplicateBids: string[];

  // --- Visual mirror ---
  /** Number of Visual rows that would be created. */
  mirrorWouldCreate: number;
  /** Number of Visual rows that would be updated (payload or order change). */
  mirrorWouldUpdate: number;
  /** Number of Visual rows that would be deleted (orphaned anchors). */
  mirrorWouldDelete: number;
  /** Number of Visual rows with payloads that fail schema validation. */
  mirrorInvalidPayloads: number;

  // --- Deck visual references ---
  /** Number of deckJson visualIds that reference non-existent Visual rows. */
  orphanedDeckVisualRefs: number;

  // --- Safety ---
  /** Whether this document is safe to migrate automatically. */
  safeToAutoMigrate: boolean;
  /**
   * Reasons the document is NOT safe to auto-migrate. Populated when
   * safeToAutoMigrate = false. Each entry is a stable reason code.
   */
  unsafeReasons: DryRunUnsafeReason[];
}

type DryRunUnsafeReason =
  | "duplicate-bids" // Two nodes share the same bid — cannot safely deduplicate
  | "invalid-visual-payload" // One or more Visual rows have corrupt data
  | "orphaned-deck-visual-ref" // deckJson references a non-existent Visual id
  | "missing-content-json"; // Document has no contentJson (cannot stamp)
```

### Aggregate report

```ts
interface DryRunSummaryReport {
  /** Total documents scanned. */
  scanned: number;
  /** Documents that need at least one change. */
  needsChange: number;
  /** Documents safe to auto-migrate. */
  safeToAutoMigrate: number;
  /** Documents that require human review before migration. */
  requiresReview: number;
  /** Total new bids that would be stamped across all documents. */
  totalMissingBids: number;
  /** Total Visual rows that would be created across all documents. */
  totalMirrorCreates: number;
  /** Total Visual rows that would be deleted across all documents. */
  totalMirrorDeletes: number;
}
```

---

## 4. Rollback and recovery strategy

| Migration class                   | Rollback mechanism                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Class A (bid stamp)               | No rollback needed — additive only                                                                       |
| Class B (mirror rebuild)          | `VisualRevision` table preserves pre-rebuild payload; restore via `restoreVisualRevision` if implemented |
| Class C (orphaned deck ref strip) | `DocumentVersion` snapshot allows full document restore via `restoreDocumentVersion`                     |

**General rule:** Never run a broad migration without taking a DB backup first
(outside the scope of this plan, but required by ops procedure).

---

## 5. Migration execution strategy

| Phase             | Mechanism                                             | Scope                           |
| ----------------- | ----------------------------------------------------- | ------------------------------- |
| Lazy stamping     | `stampBlockIds` in `saveDocumentLexical`              | Per-document, on every save     |
| On-demand rebuild | `rebuildVisualMirror(documentId)` server action       | Per-document, owner/editor only |
| Batch dry-run     | `backfillDryRun(documentIds)` helper (see §6)         | Admin/maintenance script        |
| Batch apply       | NOT implemented yet — requires dry-run sign-off first | Controlled admin action         |

**Lazy stamping is the preferred path** for the vast majority of documents.
Batch migration is only needed for documents that have not been opened/saved
since #430 landed.

---

## 6. Dry-run helper

See `src/lib/maintenance/backfill-dry-run.ts` for the pure, no-write
implementation of the dry-run analysis. The helper:

- Accepts a `contentJson` and existing Visual rows as inputs.
- Returns a `DryRunDocumentReport` without any DB writes.
- Is safe to call in a maintenance script, an admin route, or a unit test.

```ts
import { analyseDocumentForMigration } from "@/lib/maintenance/backfill-dry-run";

const report = analyseDocumentForMigration({
  documentId: "doc-xyz",
  contentJson: document.contentJson,
  existingVisualRows: visuals,
  deckJson: document.deckJson,
  existingVisualIds: new Set(visuals.map((v) => v.id)),
});

if (!report.safeToAutoMigrate) {
  console.log("Manual review required:", report.unsafeReasons);
}
```

---

## 7. Unsafe cases (never auto-repaired)

The following cases must NOT be auto-repaired without a human decision:

| Unsafe case                     | Why it is unsafe                                                                |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Duplicate `bid` values          | Two nodes would claim the same identity; the correct survivor is ambiguous      |
| Invalid visual payloads         | The stored data is corrupt; correct repair requires knowing the original intent |
| Orphaned deck visual refs       | Removing a slide element reference is a visible user-facing change              |
| Documents with no `contentJson` | Cannot stamp block ids on null content                                          |

---

## 8. Minimum automated tests before broad migration

Before running a batch migration across all documents:

1. `npm test` — all existing tests pass (no regressions in block-id or mirror logic).
2. `src/lib/maintenance/backfill-dry-run.test.ts` — all dry-run helper tests pass.
3. Dry-run report on a representative sample (≥100 documents) is reviewed and shows
   `requiresReview` count within expected bounds.
4. At least one document from each fixture category below has been manually verified:
   - Document with no bids (pre-#430)
   - Document with all bids present
   - Document with duplicate bids
   - Document with an invalid visual payload
   - Document with an orphaned deck visual reference
   - Document restored from a legacy version

---

## 9. Fixture categories for test coverage

Tests must cover the following categories (see `backfill-dry-run.test.ts`):

| Category                 | Expected dry-run result                                    |
| ------------------------ | ---------------------------------------------------------- |
| No bids (all missing)    | `missingBidCount > 0`, `safeToAutoMigrate: true`           |
| All bids present         | `missingBidCount = 0`, no changes needed                   |
| Duplicate bids           | `hasDuplicateBids: true`, `safeToAutoMigrate: false`       |
| Invalid visual payload   | `mirrorInvalidPayloads > 0`, `safeToAutoMigrate: false`    |
| Orphaned deck visual ref | `orphanedDeckVisualRefs > 0`, `safeToAutoMigrate: false`   |
| Legacy version restored  | same as "no bids" — stamps are additive                    |
| Empty contentJson        | `safeToAutoMigrate: false`, reason: `missing-content-json` |
