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

import { storeAssetWithUpsert } from "@/lib/assets/store";
import { BRAND_MIME_TO_EXT } from "@/lib/brand/asset-policy";
import { prisma } from "@/lib/prisma";
import { getBrandStorageAdapter } from "@/lib/brand/asset-storage";

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

  const adapter = getBrandStorageAdapter();
  return storeAssetWithUpsert({
    scopeId: ownerId,
    buffer,
    mimeType,
    originalName,
    mimeToExt: BRAND_MIME_TO_EXT,
    storage: adapter,
    storeBeforeFind: true,
    async findExisting({ storageKey }) {
      return prisma.asset.findUnique({
        where: { storageKey },
        select: { id: true, storageKey: true, deletedAt: true, brandId: true },
      });
    },
    async updateExisting(existing) {
      const data: { deletedAt?: null; brandId?: string } = {};
      if (existing.deletedAt) data.deletedAt = null;
      if (brandId && existing.brandId !== brandId) data.brandId = brandId;
      if (Object.keys(data).length > 0) {
        await prisma.asset.update({ where: { id: existing.id }, data });
      }
    },
    async createAsset(input) {
      return prisma.asset.create({
        data: {
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          checksum: input.checksum,
          storageKey: input.storageKey,
          ...(brandId ? { brandId } : {}),
          ...(input.originalName ? { originalName: input.originalName } : {}),
        },
        select: { id: true },
      });
    },
    async findAfterConflict({ storageKey }) {
      return prisma.asset.findUnique({
        where: { storageKey },
        select: { id: true },
      });
    },
  });
}
