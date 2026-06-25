/**
 * Server-side helper that persists brand asset bytes and tracks them as a
 * durable `Asset` row (Epic #496).
 *
 * Shared by the `/api/brand/logo` and `/api/brand/font` upload routes so both
 * follow the same path: SHA-256 checksum → owner-partitioned storage key →
 * write bytes via the brand storage adapter → upsert the `Asset` row (with
 * P2002 race recovery and soft-delete revival). Dedup is by the unique
 * `storageKey` (`${ownerId}/${checksum}.${ext}`), so re-uploading identical
 * bytes returns the existing asset instead of duplicating it.
 *
 * The caller links the returned `assetId` to a brand (`logoAssetId` /
 * `fontAssetId`) when the brand is saved; the display URL is the protected
 * `/api/brand-assets/…` URL returned here.
 */

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { withP2002Fallback } from "@/lib/db/p2002-fallback";
import {
  deriveBrandStorageKey,
  getBrandStorageAdapter,
} from "@/lib/brand/asset-storage";

export interface StoreBrandAssetResult {
  assetId: string;
  /** Protected `/api/brand-assets/…` URL for the stored bytes. */
  url: string;
  checksum: string;
  storageKey: string;
}

/**
 * Stores brand asset bytes and returns the asset id + protected URL.
 *
 * @param ownerId      - Owning user id (storage partition + access boundary).
 * @param buffer       - Raw validated file bytes.
 * @param mimeType     - Validated MIME type (drives the storage extension).
 * @param originalName - Optional original filename for display UX.
 * @param brandId      - Optional brand to scope the asset to (linked on save).
 */
export async function storeBrandAsset(opts: {
  ownerId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  brandId?: string | null;
}): Promise<StoreBrandAssetResult> {
  const { ownerId, buffer, mimeType, originalName, brandId } = opts;

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storageKey = deriveBrandStorageKey(ownerId, checksum, mimeType);
  const adapter = getBrandStorageAdapter();

  // Always (re)write the bytes so storage stays consistent even if a prior
  // purge removed the file while the row lingered.
  const url = await adapter.store(storageKey, buffer, mimeType);

  // Dedup / revive by the unique storage key.
  const existing = await prisma.asset.findUnique({
    where: { storageKey },
    select: { id: true, deletedAt: true, brandId: true },
  });
  if (existing) {
    const data: { deletedAt?: null; brandId?: string } = {};
    if (existing.deletedAt) data.deletedAt = null;
    if (brandId && existing.brandId !== brandId) data.brandId = brandId;
    if (Object.keys(data).length > 0) {
      await prisma.asset.update({ where: { id: existing.id }, data });
    }
    return { assetId: existing.id, url, checksum, storageKey };
  }

  const asset = await withP2002Fallback<{ id: string }>(
    () =>
      prisma.asset.create({
        data: {
          mimeType,
          byteSize: buffer.byteLength,
          checksum,
          storageKey,
          ...(brandId ? { brandId } : {}),
          ...(originalName ? { originalName } : {}),
        },
        select: { id: true },
      }),
    () =>
      prisma.asset.findUnique({
        where: { storageKey },
        select: { id: true },
      }),
  );

  return { assetId: asset.id, url, checksum, storageKey };
}
