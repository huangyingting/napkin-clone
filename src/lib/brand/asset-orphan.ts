/**
 * Orphan detection and cleanup for brand assets (Epic #496, issue #516).
 *
 * Mirrors the slide-asset lifecycle (`@/lib/slides/asset-orphan`) for brand
 * logos / fonts:
 *
 *  - An asset is "live" when an ACTIVE `Brand` references it through
 *    `logoAssetId` or `fontAssetId`.
 *  - When a brand replaces its logo/font, the previously-referenced asset is no
 *    longer live → it is soft-deleted (`deletedAt` set).
 *  - When a brand is deleted, `Asset.brandId` is nulled by the `onDelete:
 *    SetNull` relation; the delete path soft-deletes those assets so they do
 *    not linger as permanent orphans.
 *  - Soft-deleted brand assets are physically purged only after
 *    {@link BRAND_ASSET_RETENTION_MS} has elapsed.
 *
 * Brand-origin assets are identified by the absence of a document/workspace
 * scope (`documentId == null && workspaceId == null`): unlike slide assets they
 * are never document-scoped, and their bytes live under `storage/brand-assets/`.
 *
 * Pure helpers ({@link selectBrandOrphanIds}) have no I/O; the DB/storage
 * interfaces are injectable so the control flow is fully unit-testable without a
 * live database. No React / Next / browser APIs.
 */

import {
  logAssetOrphanEvent,
  logAssetOrphanFailure,
} from "@/lib/diagnostics/domain-events";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum time (ms) an orphaned brand asset must remain soft-deleted before it
 * is eligible for physical purge. Matches the slide-asset window (7 days).
 */
export const BRAND_ASSET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure selection
// ---------------------------------------------------------------------------

/**
 * Given the set of asset ids still referenced by an active brand and the brand's
 * currently-live (non-deleted) assets, returns the ids that are orphaned (live
 * in storage but no longer referenced). Pure — no I/O.
 */
export function selectBrandOrphanIds(
  liveRefs: ReadonlySet<string>,
  brandAssets: readonly { id: string }[],
): string[] {
  return brandAssets.filter((a) => !liveRefs.has(a.id)).map((a) => a.id);
}

// ---------------------------------------------------------------------------
// DB / storage interfaces (injectable for tests)
// ---------------------------------------------------------------------------

export interface BrandOrphanDb {
  brand: {
    findUnique(args: {
      where: { id: string };
      select: { logoAssetId: true; fontAssetId: true };
    }): Promise<{
      logoAssetId: string | null;
      fontAssetId: string | null;
    } | null>;
  };
  asset: {
    findMany(args: {
      where:
        | { brandId: string; deletedAt: null }
        | {
            documentId: null;
            workspaceId: null;
            deletedAt: { not: null; lt: Date };
          };
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
}

export interface BrandOrphanStorage {
  delete(storageKey: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Reconcile a single brand's assets
// ---------------------------------------------------------------------------

/**
 * Soft-deletes the assets scoped to `brandId` that the brand no longer
 * references (`logoAssetId` / `fontAssetId`). Idempotent: already soft-deleted
 * assets are excluded from the scan. Returns the number of assets orphaned.
 */
export async function reconcileBrandAssets(
  brandId: string,
  db: BrandOrphanDb,
  now: Date = new Date(),
): Promise<number> {
  const brand = await db.brand.findUnique({
    where: { id: brandId },
    select: { logoAssetId: true, fontAssetId: true },
  });
  if (!brand) return 0;

  const liveRefs = new Set<string>();
  if (brand.logoAssetId) liveRefs.add(brand.logoAssetId);
  if (brand.fontAssetId) liveRefs.add(brand.fontAssetId);

  const liveAssets = await db.asset.findMany({
    where: { brandId, deletedAt: null },
    select: { id: true },
  });

  const orphanIds = selectBrandOrphanIds(liveRefs, liveAssets);
  if (orphanIds.length === 0) return 0;

  const result = await db.asset.updateMany({
    where: { id: { in: orphanIds } },
    data: { deletedAt: now },
  });

  logAssetOrphanEvent("brand", "mark", "brand assets marked as orphaned", {
    brandId,
    markedCount: result.count,
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Purge expired brand assets
// ---------------------------------------------------------------------------

/**
 * Physically deletes (from storage + DB) brand-origin assets that are
 * soft-deleted and whose `deletedAt` is older than {@link
 * BRAND_ASSET_RETENTION_MS}. Brand-origin assets are those with neither a
 * document nor a workspace scope. Idempotent and storage-failure tolerant: a
 * key whose storage delete fails is left in the DB for a later retry.
 */
export async function purgeExpiredBrandAssets(
  db: BrandOrphanDb,
  storage: BrandOrphanStorage,
  retentionMs: number = BRAND_ASSET_RETENTION_MS,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs);

  const rawAssets = await db.asset.findMany({
    where: {
      documentId: null,
      workspaceId: null,
      deletedAt: { not: null, lt: cutoff },
    },
    select: { id: true, storageKey: true },
  });
  const expired = rawAssets.filter(
    (a): a is { id: string; storageKey: string } =>
      typeof a.storageKey === "string",
  );
  if (expired.length === 0) return 0;

  const purgedIds: string[] = [];
  for (const asset of expired) {
    try {
      await storage.delete(asset.storageKey);
      purgedIds.push(asset.id);
    } catch (err) {
      logAssetOrphanFailure("brand", "storage_delete", err, {
        storageKey: asset.storageKey,
      });
    }
  }
  if (purgedIds.length === 0) return 0;

  const result = await db.asset.deleteMany({
    where: { id: { in: purgedIds } },
  });

  logAssetOrphanEvent("brand", "purge", "brand assets physically purged", {
    purgedCount: result.count,
  });

  return result.count;
}
