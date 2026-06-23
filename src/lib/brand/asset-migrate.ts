/**
 * Offline migration core for brand data URLs → protected assets (Epic #496,
 * issue #515).
 *
 * Before #496, `Brand.logoUrl` and `Brand.fontDataUrl` stored base64 `data:`
 * URLs inline. This module decodes those, stores the bytes as protected brand
 * `Asset` rows, and rewrites the brand to asset-backed refs (`logoAssetId` /
 * `fontAssetId`), clearing the legacy columns.
 *
 * The pure planner ({@link planBrandAssetMigration}) is I/O-free and fully
 * unit-testable; the side-effecting apply ({@link applyBrandAssetMigration})
 * takes injectable dependencies so tests can use in-memory fixtures. Idempotency
 * is structural: a brand whose logo/font already has an asset ref (or whose
 * legacy column is not a `data:` URL) produces no plan item, so re-running
 * changes 0 rows.
 *
 * Runtime render/export paths never branch on the legacy data-URL shape — the
 * forward migration is the only place that shape is read (AGENTS.md).
 */

import { createHash } from "node:crypto";

import { deriveBrandStorageKey } from "@/lib/brand/asset-storage";

// ---------------------------------------------------------------------------
// Data-URL parsing
// ---------------------------------------------------------------------------

export interface DataUrlParts {
  mime: string;
  bytes: Buffer;
}

/**
 * Parses a `data:<mime>;base64,<payload>` URL into its MIME type and decoded
 * bytes. Returns `null` for any value that is not a base64 data URL (e.g. an
 * already-migrated protected `/api/brand-assets/…` URL, a remote URL, or null).
 */
export function parseDataUrl(
  value: string | null | undefined,
): DataUrlParts | null {
  if (typeof value !== "string") return null;
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const mime = match[1].trim();
  if (!mime) return null;
  try {
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength === 0) return null;
    return { mime, bytes };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Planning (pure)
// ---------------------------------------------------------------------------

export type BrandAssetKind = "logo" | "font";

/** A row of the `Brand` table relevant to the migration. */
export interface BrandMigrationRow {
  id: string;
  ownerId: string;
  logoUrl: string | null;
  fontDataUrl: string | null;
  logoAssetId: string | null;
  fontAssetId: string | null;
}

/** One planned asset write + brand link derived from a legacy data URL. */
export interface BrandAssetPlanItem {
  brandId: string;
  ownerId: string;
  kind: BrandAssetKind;
  mime: string;
  checksum: string;
  byteSize: number;
  storageKey: string;
  bytes: Buffer;
}

export interface BrandMigrationPlan {
  items: BrandAssetPlanItem[];
  /** Brands/fields skipped because they were already migrated or had no data URL. */
  skipped: number;
}

function planField(
  row: BrandMigrationRow,
  kind: BrandAssetKind,
): BrandAssetPlanItem | null {
  const alreadyLinked = kind === "logo" ? row.logoAssetId : row.fontAssetId;
  if (alreadyLinked) return null; // idempotent: already migrated

  const raw = kind === "logo" ? row.logoUrl : row.fontDataUrl;
  const parsed = parseDataUrl(raw);
  if (!parsed) return null;

  const checksum = createHash("sha256").update(parsed.bytes).digest("hex");
  const storageKey = deriveBrandStorageKey(row.ownerId, checksum, parsed.mime);
  return {
    brandId: row.id,
    ownerId: row.ownerId,
    kind,
    mime: parsed.mime,
    checksum,
    byteSize: parsed.bytes.byteLength,
    storageKey,
    bytes: parsed.bytes,
  };
}

/**
 * Builds the migration plan over a set of brand rows. Pure — performs no I/O.
 * Each brand may contribute up to two plan items (logo + font).
 */
export function planBrandAssetMigration(
  rows: readonly BrandMigrationRow[],
): BrandMigrationPlan {
  const items: BrandAssetPlanItem[] = [];
  let skipped = 0;
  for (const row of rows) {
    for (const kind of ["logo", "font"] as const) {
      const item = planField(row, kind);
      if (item) items.push(item);
      else skipped += 1;
    }
  }
  return { items, skipped };
}

// ---------------------------------------------------------------------------
// Apply (injectable side effects)
// ---------------------------------------------------------------------------

export interface BrandMigrateDeps {
  /** Persists asset bytes for the given storage key. */
  storeBytes(storageKey: string, bytes: Buffer, mime: string): Promise<void>;
  /**
   * Upserts an `Asset` row for the item and returns its id. Must be idempotent
   * on `storageKey` (dedup), returning the existing id on a repeat call.
   */
  upsertAsset(item: BrandAssetPlanItem): Promise<string>;
  /** Links the resolved asset id onto the brand and clears the legacy column. */
  linkBrand(
    brandId: string,
    kind: BrandAssetKind,
    assetId: string,
  ): Promise<void>;
}

export interface BrandMigrationResult {
  applied: boolean;
  scanned: number;
  planned: number;
  changed: number;
  skipped: number;
  failed: number;
}

/**
 * Runs the migration over `rows`. In dry-run mode (default) it reports the
 * counts an apply WOULD produce without invoking any dependency. In apply mode
 * it stores bytes, upserts the asset, and links the brand for each plan item.
 * Never throws for a single bad item — failures are counted.
 */
export async function applyBrandAssetMigration(
  rows: readonly BrandMigrationRow[],
  deps: BrandMigrateDeps,
  options: { apply?: boolean } = {},
): Promise<BrandMigrationResult> {
  const apply = options.apply === true;
  const plan = planBrandAssetMigration(rows);

  let changed = 0;
  let failed = 0;

  for (const item of plan.items) {
    try {
      if (apply) {
        await deps.storeBytes(item.storageKey, item.bytes, item.mime);
        const assetId = await deps.upsertAsset(item);
        await deps.linkBrand(item.brandId, item.kind, assetId);
      }
      changed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    applied: apply,
    scanned: rows.length,
    planned: plan.items.length,
    changed,
    skipped: plan.skipped,
    failed,
  };
}

/**
 * Formats a migration result as human-readable lines (counts + mode). Safe to
 * print — contains no row content.
 */
export function formatBrandMigrationResult(
  result: BrandMigrationResult,
): string[] {
  const mode = result.applied ? "APPLY" : "DRY-RUN";
  return [
    `Brand asset migration [${mode}]`,
    `  scanned brands: ${result.scanned}`,
    `  planned items:  ${result.planned}`,
    `  changed:        ${result.changed}${result.applied ? " (persisted)" : " (would change)"}`,
    `  skipped fields: ${result.skipped}`,
    `  failed:         ${result.failed}`,
  ];
}

/** Standard backup + rollback guidance printed before any apply run. */
export function brandMigrationBackupGuidance(): string[] {
  return [
    "Before applying, take a restore point:",
    '  • Postgres: pg_dump "$DATABASE_URL" > backup.sql',
    "  • SQLite:   cp prisma/dev.db prisma/dev.db.bak",
    "  • Brand asset bytes: back up the storage/brand-assets/ directory.",
    "Rollback: restore the DB dump (re-populates Brand.logoUrl/fontDataUrl and",
    "clears the asset refs). Newly-written asset bytes under storage/brand-assets/",
    "are harmless to leave; the orphan/purge pass reclaims unreferenced ones.",
    "Run with --dry-run first (the default) and review the counts.",
  ];
}
