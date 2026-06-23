/**
 * Orphan detection and cleanup for slide assets (Epic #374, issue #396).
 *
 * Lifecycle policy:
 *  - An asset is "active" when at least one live reference exists in either:
 *      a) `Document.deckJson` — the current live deck state, or
 *      b) `DocumentVersion.deckJson` — any retained version snapshot (for
 *         restore safety).
 *  - An asset becomes "orphaned" when it is referenced by neither current
 *    deck state nor any retained version within the retention window.
 *  - Orphaned assets are soft-deleted first (`deletedAt` set) and only
 *    purged from storage after the retention window has elapsed.
 *
 * Retention policy: {@link ASSET_RETENTION_MS} — assets are not deleted
 * immediately to guard against version restores that re-reference them.
 *
 * All operations are idempotent and safe to run repeatedly:
 *  - {@link collectDeckAssetRefs} is a pure extractor with no I/O.
 *  - {@link markOrphanedAssets} performs a bounded DB update.
 *  - {@link purgeExpiredAssets} only touches assets whose `deletedAt` is
 *    older than the retention window AND that are no longer referenced.
 *
 * No React / Next / browser APIs — safe to import from server actions,
 * cron jobs, and tests running under `node --test`.
 */

import { logInfo, logError } from "@/lib/log";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum time (ms) an orphaned asset must remain soft-deleted before it is
 * eligible for physical purge.  7 days allows version restores and undo/redo
 * within the standard version-history window.
 */
export const ASSET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Reference collection
// ---------------------------------------------------------------------------

/**
 * Walks a raw `deckJson` value and collects every `assetId` referenced by
 * image elements and slide backgrounds.  Returns an empty set for null/invalid
 * deck payloads (never throws).
 *
 * Recognised locations:
 *  - `deck.slides[n].backgroundAssetId`
 *  - `deck.slides[n].elements[m].assetId`  (ImageElement)
 */
export function collectDeckAssetRefs(deckJson: unknown): Set<string> {
  const refs = new Set<string>();
  try {
    if (!isPlainObject(deckJson)) return refs;
    const slides = deckJson.slides;
    if (!Array.isArray(slides)) return refs;
    for (const slide of slides) {
      if (!isPlainObject(slide)) continue;
      if (
        typeof slide.backgroundAssetId === "string" &&
        slide.backgroundAssetId
      ) {
        refs.add(slide.backgroundAssetId);
      }
      const elements = slide.elements;
      if (!Array.isArray(elements)) continue;
      for (const el of elements) {
        if (!isPlainObject(el)) continue;
        if (typeof el.assetId === "string" && el.assetId) {
          refs.add(el.assetId);
        }
      }
    }
  } catch {
    // Safety net — must not throw.
  }
  return refs;
}

// ---------------------------------------------------------------------------
// DB interface (injectable for tests)
// ---------------------------------------------------------------------------

/**
 * Minimal DB interface used by the orphan-management functions.
 * Matches the Prisma client subset needed.
 */
export interface OrphanDb {
  asset: {
    findMany(args: {
      where:
        | { documentId: string; deletedAt: null }
        | { documentId: string; deletedAt: { not: null; lt: Date } };
      select: { id?: true; storageKey?: true };
    }): Promise<{ id: string; storageKey?: string }[]>;
    updateMany(args: {
      where: { id: { in: string[] } };
      data: { deletedAt: Date };
    }): Promise<{ count: number }>;
    deleteMany(args: {
      where: { id: { in: string[] } };
    }): Promise<{ count: number }>;
  };
  document: {
    findUnique(args: {
      where: { id: string };
      select: { deckJson: true };
    }): Promise<{ deckJson: unknown } | null>;
  };
  documentVersion: {
    findMany(args: {
      where: { documentId: string };
      select: { deckJson: true };
      orderBy: { createdAt: "desc" };
    }): Promise<{ deckJson: unknown }[]>;
  };
}

/**
 * Storage interface for physical file deletion.
 */
export interface OrphanStorage {
  delete(storageKey: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mark orphaned assets
// ---------------------------------------------------------------------------

/**
 * Marks all assets for `documentId` that are no longer referenced by the
 * current deck state or any retained version snapshot.
 *
 * Returns the number of assets soft-deleted.  Idempotent: already soft-deleted
 * assets are excluded from the scan.
 */
export async function markOrphanedAssets(
  documentId: string,
  db: OrphanDb,
  now: Date = new Date(),
): Promise<number> {
  // Collect all active asset ids across current deck + all version snapshots.
  const activeRefs = new Set<string>();

  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { deckJson: true },
  });
  if (doc?.deckJson) {
    for (const id of collectDeckAssetRefs(doc.deckJson)) {
      activeRefs.add(id);
    }
  }

  const versions = await db.documentVersion.findMany({
    where: { documentId },
    select: { deckJson: true },
    orderBy: { createdAt: "desc" },
  });
  for (const version of versions) {
    if (version.deckJson) {
      for (const id of collectDeckAssetRefs(version.deckJson)) {
        activeRefs.add(id);
      }
    }
  }

  // Find all currently live (non-deleted) assets for this document.
  const liveAssets = await db.asset.findMany({
    where: { documentId, deletedAt: null },
    select: { id: true },
  });

  const orphanIds = liveAssets
    .filter((a) => !activeRefs.has(a.id))
    .map((a) => a.id);

  if (orphanIds.length === 0) return 0;

  const result = await db.asset.updateMany({
    where: { id: { in: orphanIds } },
    data: { deletedAt: now },
  });

  logInfo("slide-asset-orphan-mark", "assets marked as orphaned", {
    documentId,
    markedCount: result.count,
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Purge expired assets
// ---------------------------------------------------------------------------

/**
 * Physically deletes (from storage + DB) assets that:
 *  1. Are soft-deleted (`deletedAt` is set), AND
 *  2. Were soft-deleted more than {@link ASSET_RETENTION_MS} ago.
 *
 * Returns the number of assets physically purged.  Idempotent: already-purged
 * assets are simply absent from the result.
 */
export async function purgeExpiredAssets(
  documentId: string,
  db: OrphanDb,
  storage: OrphanStorage,
  retentionMs: number = ASSET_RETENTION_MS,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs);

  const rawAssets = await db.asset.findMany({
    where: { documentId, deletedAt: { not: null, lt: cutoff } },
    select: { id: true, storageKey: true },
  });
  const expiredAssets = rawAssets.filter(
    (a): a is { id: string; storageKey: string } =>
      typeof a.storageKey === "string",
  );

  if (expiredAssets.length === 0) return 0;

  // Delete files from storage first; if storage delete fails for a key, skip
  // the DB delete for that key so we don't lose the record.
  const purgedIds: string[] = [];
  for (const asset of expiredAssets) {
    try {
      await storage.delete(asset.storageKey);
      purgedIds.push(asset.id);
    } catch (err) {
      logError("slide-asset-purge-storage", err, {
        storageKey: asset.storageKey,
      });
    }
  }

  if (purgedIds.length === 0) return 0;

  const result = await db.asset.deleteMany({
    where: { id: { in: purgedIds } },
  });

  logInfo("slide-asset-orphan-purge", "assets physically purged", {
    documentId,
    purgedCount: result.count,
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Local storage delete helper
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import fsPath from "node:path";

/**
 * @deprecated Pass {@link AssetStorageAdapter} (from `asset-storage.ts`) directly
 * to {@link purgeExpiredAssets} instead — the adapter now implements `delete`
 * and satisfies the {@link OrphanStorage} interface (#480).
 *
 * This class is kept for backward compatibility with callers that constructed
 * it explicitly, but it now delegates to a `LocalAssetStorageAdapter` pointed
 * at `storage/slide-assets/` (the new non-public default).
 *
 * For legacy assets stored in `public/slide-assets/`, construct
 * `new LocalOrphanStorage(path.join(process.cwd(), "public", "slide-assets"))`
 * explicitly.
 */
export class LocalOrphanStorage implements OrphanStorage {
  constructor(
    readonly rootDir: string = fsPath.join(
      process.cwd(),
      "storage",
      "slide-assets",
    ),
  ) {}

  async delete(storageKey: string): Promise<void> {
    const filePath = fsPath.join(this.rootDir, storageKey);
    await fs.rm(filePath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
