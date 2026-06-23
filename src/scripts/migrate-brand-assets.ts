/**
 * Offline brand asset migration CLI (Epic #496, issue #515).
 *
 * Wires the reusable core in `src/lib/brand/asset-migrate.ts` to the app Prisma
 * client and the brand storage adapter. It scans `Brand.logoUrl` /
 * `Brand.fontDataUrl` for base64 `data:` URLs, decodes the bytes, writes
 * protected brand `Asset` rows, links them onto the brand (`logoAssetId` /
 * `fontAssetId`), and clears the legacy columns.
 *
 * Usage:
 *   node --import tsx src/scripts/migrate-brand-assets.ts            # dry run (default)
 *   node --import tsx src/scripts/migrate-brand-assets.ts --apply    # persist changes
 *
 * npm script: `npm run migrate:brand-assets [-- --apply]`.
 *
 * Defaults to a dry run; `--apply` is required to mutate data. Idempotent:
 * re-running after an apply changes 0 rows.
 */

import { prisma } from "@/lib/prisma";
import { resolveProvider } from "@/lib/db-provider";
import { withP2002Fallback } from "@/lib/slides/p2002-fallback";
import { getBrandStorageAdapter } from "@/lib/brand/asset-storage";
import {
  applyBrandAssetMigration,
  brandMigrationBackupGuidance,
  formatBrandMigrationResult,
  type BrandAssetPlanItem,
  type BrandMigrateDeps,
  type BrandMigrationRow,
} from "@/lib/brand/asset-migrate";

function printLines(lines: string[]): void {
  for (const line of lines) console.log(line);
}

/** Prisma + storage-backed dependencies for the migration core. */
function makeDeps(): BrandMigrateDeps {
  const adapter = getBrandStorageAdapter();
  return {
    async storeBytes(storageKey, bytes, mime) {
      await adapter.store(storageKey, bytes, mime);
    },
    async upsertAsset(item: BrandAssetPlanItem) {
      const existing = await prisma.asset.findUnique({
        where: { storageKey: item.storageKey },
        select: { id: true, deletedAt: true },
      });
      if (existing) {
        if (existing.deletedAt) {
          await prisma.asset.update({
            where: { id: existing.id },
            data: { deletedAt: null, brandId: item.brandId },
          });
        }
        return existing.id;
      }
      const created = await withP2002Fallback<{ id: string }>(
        () =>
          prisma.asset.create({
            data: {
              brandId: item.brandId,
              mimeType: item.mime,
              byteSize: item.byteSize,
              checksum: item.checksum,
              storageKey: item.storageKey,
            },
            select: { id: true },
          }),
        () =>
          prisma.asset.findUnique({
            where: { storageKey: item.storageKey },
            select: { id: true },
          }),
      );
      return created.id;
    },
    async linkBrand(brandId, kind, assetId) {
      await prisma.brand.update({
        where: { id: brandId },
        data:
          kind === "logo"
            ? { logoAssetId: assetId, logoUrl: null }
            : { fontAssetId: assetId, fontDataUrl: null },
      });
    },
  };
}

async function loadRows(): Promise<BrandMigrationRow[]> {
  return prisma.brand.findMany({
    select: {
      id: true,
      ownerId: true,
      logoUrl: true,
      fontDataUrl: true,
      logoAssetId: true,
      fontAssetId: true,
    },
  });
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");

  console.log(`Brand asset migration (provider: ${resolveProvider()})`);

  if (apply) {
    printLines(brandMigrationBackupGuidance());
  } else {
    console.log(
      "Dry run (no changes will be written). Pass --apply to persist.",
    );
  }

  const rows = await loadRows();
  const result = await applyBrandAssetMigration(rows, makeDeps(), { apply });
  printLines(formatBrandMigrationResult(result));

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      `Brand asset migration failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
