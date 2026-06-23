/**
 * Pure, DOM-free diff logic for {@link mirrorVisualNodes} (issue #138).
 *
 * Given the `Visual` rows currently persisted for a document and the live
 * {@link VisualNode}s in the editor state, this computes the minimal set of
 * create / update / delete operations needed to mirror the editor into the
 * `Visual` table. Keeping the decision logic free of Prisma and Lexical makes it
 * trivially unit-testable; the caller (a server action) is responsible only for
 * gathering the inputs and executing the resulting operations inside a single
 * transaction.
 */

/** A `Visual` row as read from the database, reduced to the fields we diff on. */
export type ExistingVisualRow = {
  id: string;
  anchorBlockId: string | null;
  orderIndex: number;
  /**
   * Stable, normalized JSON serialization of the row's current `data`, used to
   * detect whether the payload actually changed. `null` when the stored payload
   * can't be re-validated (forces an update so the row is repaired).
   */
  dataKey: string | null;
  /** Creation time (epoch ms). */
  createdAt: number;
};

/** A validated live visual node, carrying the payload to persist. */
export type LiveVisualNode<TData = unknown> = {
  anchorBlockId: string;
  orderIndex: number;
  type: string;
  title: string | null;
  data: TData;
  /** Normalized JSON serialization of `data`, compared against `dataKey`. */
  dataKey: string;
};

type VisualCreate<TData = unknown> = {
  anchorBlockId: string;
  orderIndex: number;
  type: string;
  title: string | null;
  data: TData;
};

type VisualUpdate<TData = unknown> = {
  id: string;
  orderIndex: number;
  type: string;
  title: string | null;
  data: TData;
  /**
   * `true` when the payload (not just order) changed — the caller snapshots the
   * previous row into history before overwriting; `false` is an order-only move.
   */
  payloadChanged: boolean;
};

export type VisualMirrorDiff<TData = unknown> = {
  toCreate: Array<VisualCreate<TData>>;
  toUpdate: Array<VisualUpdate<TData>>;
  /** Row ids to delete for orphaned anchors. */
  toDelete: string[];
};

/**
 * Structured counts of what the mirror pipeline did (or plans to do).
 * Returned by `mirrorVisualNodes` and `rebuildVisualMirror`; also emitted as
 * a structured log entry so production pipelines can track drift over time.
 * Never contains visual payloads or PII — only counts and ids.
 */
export type VisualMirrorOutcome = {
  /** Rows inserted into the Visual table. */
  created: number;
  /** Rows updated (payload change or order-only move). */
  updated: number;
  /** Rows deleted (orphaned anchors + stale duplicates). */
  deleted: number;
  /**
   * Nodes whose `visual` payload failed `safeParseVisual`. The anchor is kept
   * alive (existing row preserved) but no create/update is emitted.
   */
  skipped: number;
  /**
   * Nodes with a missing or empty `visualId`. These produce neither an anchor
   * nor a live node; they are invisible to the mirror.
   */
  invalid: number;
};

/**
 * Derives a {@link VisualMirrorOutcome} from a completed diff plus the
 * per-node counters collected during node collection (before diffing).
 *
 * Keeping this as a pure helper lets tests verify outcome computation
 * independently of DB I/O.
 */
export function mirrorOutcomeFromDiff(
  diff: VisualMirrorDiff,
  skipped: number,
  invalid: number,
): VisualMirrorOutcome {
  return {
    created: diff.toCreate.length,
    updated: diff.toUpdate.length,
    deleted: diff.toDelete.length,
    skipped,
    invalid,
  };
}

/**
 * Computes the create/update/delete plan to mirror `liveNodes` into the
 * `Visual` table given the document's `existingRows`.
 *
 * - `liveAnchors` is the set of every anchor present in the editor — including
 *   nodes whose payload failed validation. Those anchors keep their existing
 *   row alive (never pruned) but produce no create/update, matching the current
 *   behavior where an invalid payload is skipped rather than persisted.
 */
export function diffVisualMirror<TData = unknown>(input: {
  existingRows: ReadonlyArray<ExistingVisualRow>;
  liveNodes: ReadonlyArray<LiveVisualNode<TData>>;
  liveAnchors: ReadonlySet<string>;
}): VisualMirrorDiff<TData> {
  const { existingRows, liveNodes, liveAnchors } = input;

  const byAnchor = new Map<string, ExistingVisualRow>();
  for (const row of existingRows) {
    if (row.anchorBlockId === null) {
      continue;
    }
    byAnchor.set(row.anchorBlockId, row);
  }

  const toCreate: Array<VisualCreate<TData>> = [];
  const toUpdate: Array<VisualUpdate<TData>> = [];
  const toDelete = new Set<string>();

  for (const node of liveNodes) {
    const existing = byAnchor.get(node.anchorBlockId);

    if (!existing) {
      toCreate.push({
        anchorBlockId: node.anchorBlockId,
        orderIndex: node.orderIndex,
        type: node.type,
        title: node.title,
        data: node.data,
      });
      continue;
    }

    const payloadChanged =
      existing.dataKey === null || existing.dataKey !== node.dataKey;

    if (payloadChanged) {
      toUpdate.push({
        id: existing.id,
        orderIndex: node.orderIndex,
        type: node.type,
        title: node.title,
        data: node.data,
        payloadChanged: true,
      });
    } else if (existing.orderIndex !== node.orderIndex) {
      toUpdate.push({
        id: existing.id,
        orderIndex: node.orderIndex,
        type: node.type,
        title: node.title,
        data: node.data,
        payloadChanged: false,
      });
    }
  }

  // Prune mirrored rows whose anchor is no longer present in the editor.
  // Null anchors are no longer a valid document shape, so they are pruned too.
  for (const row of existingRows) {
    if (row.anchorBlockId === null) {
      toDelete.add(row.id);
      continue;
    }
    if (!liveAnchors.has(row.anchorBlockId)) {
      toDelete.add(row.id);
    }
  }

  return { toCreate, toUpdate, toDelete: [...toDelete] };
}
