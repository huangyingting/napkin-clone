/**
 * Pure, no-write dry-run helper for block-id and visual mirror backfill (issue #457).
 *
 * This module analyses a document's `contentJson` and existing Visual rows to
 * produce a {@link DryRunDocumentReport} describing what a migration WOULD do
 * — without writing anything to the database.
 *
 * Safety guarantees:
 *  - Pure functions only: no Prisma, no network, no side effects.
 *  - Safe to call in a maintenance script, admin route, or unit test.
 *  - Reports unsafe cases (duplicate bids, invalid payloads, orphaned refs)
 *    that must NOT be auto-repaired without a human decision.
 *  - Idempotent: running twice on the same input produces the same report.
 *
 * See: docs/architecture/migration-dry-run-plan.md
 */

import { BLOCK_NODE_TYPES } from "@/lib/lexical/block-id";
import {
  diffVisualMirror,
  type ExistingVisualRow,
  type LiveVisualNode,
} from "@/lib/visual/mirror-diff";

// ---------------------------------------------------------------------------
// Unsafe-reason codes — STABLE; do not rename
// ---------------------------------------------------------------------------

export type DryRunUnsafeReason =
  | "duplicate-bids"
  | "invalid-visual-payload"
  | "orphaned-deck-visual-ref"
  | "missing-content-json";

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

/** Per-document dry-run analysis report (no DB writes). */
export interface DryRunDocumentReport {
  documentId: string;

  // Block identity
  missingBidCount: number;
  existingBidCount: number;
  hasDuplicateBids: boolean;
  duplicateBids: string[];

  // Visual mirror
  mirrorWouldCreate: number;
  mirrorWouldUpdate: number;
  mirrorWouldDelete: number;
  mirrorInvalidPayloads: number;

  // Deck visual references
  orphanedDeckVisualRefs: number;

  // Safety
  safeToAutoMigrate: boolean;
  unsafeReasons: DryRunUnsafeReason[];
}

/** Aggregate report across multiple documents. */
export interface DryRunSummaryReport {
  scanned: number;
  needsChange: number;
  safeToAutoMigrate: number;
  requiresReview: number;
  totalMissingBids: number;
  totalMirrorCreates: number;
  totalMirrorDeletes: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Walks a raw Lexical JSON node tree and collects all block-level nodes.
 * Returns an array of { bid, type } for each block node found.
 */
function collectBlockNodes(
  node: unknown,
): Array<{ bid: string | null; type: string }> {
  if (!isRecord(node)) return [];

  // Root wrapper — descend into root
  if (isRecord(node.root)) {
    return collectBlockNodes(node.root);
  }

  const results: Array<{ bid: string | null; type: string }> = [];
  const nodeType = String(node.type ?? "");

  if (BLOCK_NODE_TYPES.has(nodeType)) {
    // Only check the actual `bid` field — NOT the legacy `key` fallback.
    // The key fallback is for read-time resolution only; the dry-run reports
    // nodes as "missing bid" when they lack the actual `bid` field so the
    // stamping pass knows exactly which nodes need upgrading.
    results.push({
      bid: nonEmptyString(node.bid) ?? null,
      type: nodeType,
    });
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      results.push(...collectBlockNodes(child));
    }
  }

  return results;
}

/**
 * Extracts the set of `visualIds` referenced in a deck JSON object.
 * Returns an empty set when the deckJson is absent or malformed.
 */
function extractDeckVisualIds(deckJson: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(deckJson)) return ids;

  const slides = Array.isArray(deckJson.slides) ? deckJson.slides : [];
  for (const slide of slides) {
    if (!isRecord(slide)) continue;
    const visualIds = Array.isArray(slide.visualIds) ? slide.visualIds : [];
    for (const id of visualIds) {
      if (typeof id === "string" && id.length > 0) {
        ids.add(id);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AnalyseDocumentInput {
  /** The document's stable id. */
  documentId: string;
  /**
   * Raw `contentJson` value from the database. May be `null` for documents
   * that have never been saved with content.
   */
  contentJson: unknown;
  /**
   * Existing Visual rows for this document. Reduced to the fields needed for
   * diffing (same shape as `ExistingVisualRow`).
   */
  existingVisualRows: ReadonlyArray<ExistingVisualRow>;
  /**
   * Raw `deckJson` value from the database. May be `null` for documents
   * without a presentation deck.
   */
  deckJson?: unknown;
  /**
   * Set of Visual ids that currently exist in the database for this document.
   * Used to detect orphaned deck visual references.
   */
  existingVisualIds?: ReadonlySet<string>;
  /**
   * Live visual nodes derived from `contentJson` parsing.
   * When absent (e.g. parsing failed), treated as an empty array — which will
   * trigger a mirror diff that marks all existing rows as "to delete".
   */
  liveVisualNodes?: ReadonlyArray<LiveVisualNode>;
  /**
   * Set of live anchor block ids (anchors that exist in the editor, even if
   * their payload is invalid). When absent, derived from `liveVisualNodes`.
   */
  liveAnchors?: ReadonlySet<string>;
  /**
   * Count of Visual payloads that failed schema validation during node
   * collection. Counted as "invalid" in the dry-run report.
   */
  invalidVisualPayloads?: number;
}

/**
 * Analyses a document for migration readiness WITHOUT writing anything.
 *
 * Returns a {@link DryRunDocumentReport} describing:
 *  - How many block nodes are missing a `bid` and would be stamped.
 *  - Whether any bids are duplicated (unsafe — requires human decision).
 *  - What the visual mirror diff would look like.
 *  - Whether any deck `visualId` references are orphaned.
 *  - Whether the document is safe to auto-migrate.
 */
export function analyseDocumentForMigration(
  input: AnalyseDocumentInput,
): DryRunDocumentReport {
  const {
    documentId,
    contentJson,
    existingVisualRows,
    deckJson,
    existingVisualIds = new Set<string>(),
    liveVisualNodes = [],
    liveAnchors,
    invalidVisualPayloads = 0,
  } = input;

  const unsafeReasons: DryRunUnsafeReason[] = [];

  // -------------------------------------------------------------------------
  // Block identity analysis
  // -------------------------------------------------------------------------

  let missingBidCount = 0;
  let existingBidCount = 0;
  let hasDuplicateBids = false;
  const duplicateBids: string[] = [];

  if (contentJson == null) {
    unsafeReasons.push("missing-content-json");
  } else {
    const blocks = collectBlockNodes(contentJson);
    const bidCounts = new Map<string, number>();

    for (const block of blocks) {
      if (block.bid == null) {
        missingBidCount++;
      } else {
        existingBidCount++;
        bidCounts.set(block.bid, (bidCounts.get(block.bid) ?? 0) + 1);
      }
    }

    for (const [bid, count] of bidCounts.entries()) {
      if (count > 1) {
        duplicateBids.push(bid);
      }
    }

    if (duplicateBids.length > 0) {
      hasDuplicateBids = true;
      unsafeReasons.push("duplicate-bids");
    }
  }

  // -------------------------------------------------------------------------
  // Visual mirror diff (dry-run: compute plan only, do not execute)
  // -------------------------------------------------------------------------

  const derivedLiveAnchors: ReadonlySet<string> =
    liveAnchors ?? new Set(liveVisualNodes.map((n) => n.anchorBlockId));

  const mirrorDiff = diffVisualMirror({
    existingRows: existingVisualRows,
    liveNodes: liveVisualNodes,
    liveAnchors: derivedLiveAnchors,
  });

  if (invalidVisualPayloads > 0) {
    unsafeReasons.push("invalid-visual-payload");
  }

  // -------------------------------------------------------------------------
  // Deck visual reference analysis
  // -------------------------------------------------------------------------

  let orphanedDeckVisualRefs = 0;
  if (deckJson != null) {
    const referencedIds = extractDeckVisualIds(deckJson);
    for (const id of referencedIds) {
      if (!existingVisualIds.has(id)) {
        orphanedDeckVisualRefs++;
      }
    }
  }

  if (orphanedDeckVisualRefs > 0) {
    unsafeReasons.push("orphaned-deck-visual-ref");
  }

  // -------------------------------------------------------------------------
  // Safety verdict
  // -------------------------------------------------------------------------

  const safeToAutoMigrate = unsafeReasons.length === 0;

  return {
    documentId,
    missingBidCount,
    existingBidCount,
    hasDuplicateBids,
    duplicateBids,
    mirrorWouldCreate: mirrorDiff.toCreate.length,
    mirrorWouldUpdate: mirrorDiff.toUpdate.length,
    mirrorWouldDelete: mirrorDiff.toDelete.length,
    mirrorInvalidPayloads: invalidVisualPayloads,
    orphanedDeckVisualRefs,
    safeToAutoMigrate,
    unsafeReasons,
  };
}

/**
 * Aggregates an array of per-document reports into a summary.
 */
export function summariseDryRun(
  reports: ReadonlyArray<DryRunDocumentReport>,
): DryRunSummaryReport {
  let needsChange = 0;
  let safeCount = 0;
  let requiresReview = 0;
  let totalMissingBids = 0;
  let totalMirrorCreates = 0;
  let totalMirrorDeletes = 0;

  for (const r of reports) {
    const hasAnyChange =
      r.missingBidCount > 0 ||
      r.mirrorWouldCreate > 0 ||
      r.mirrorWouldUpdate > 0 ||
      r.mirrorWouldDelete > 0 ||
      r.orphanedDeckVisualRefs > 0;

    if (hasAnyChange) needsChange++;
    if (r.safeToAutoMigrate) safeCount++;
    else requiresReview++;

    totalMissingBids += r.missingBidCount;
    totalMirrorCreates += r.mirrorWouldCreate;
    totalMirrorDeletes += r.mirrorWouldDelete;
  }

  return {
    scanned: reports.length,
    needsChange,
    safeToAutoMigrate: safeCount,
    requiresReview,
    totalMissingBids,
    totalMirrorCreates,
    totalMirrorDeletes,
  };
}
