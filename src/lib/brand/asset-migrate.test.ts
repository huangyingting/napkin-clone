/**
 * Tests for the brand asset data-URL → protected-asset migration core
 * (Epic #496, issue #515).
 *
 * Covers parseDataUrl, planBrandAssetMigration (pure), and
 * applyBrandAssetMigration in dry-run / apply / idempotent modes with in-memory
 * fixtures. DOM-free: runs under `node --import tsx --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyBrandAssetMigration,
  parseDataUrl,
  planBrandAssetMigration,
  type BrandMigrateDeps,
  type BrandMigrationRow,
} from "@/lib/brand/asset-migrate";

// ---------------------------------------------------------------------------
// parseDataUrl
// ---------------------------------------------------------------------------

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from("PNGBYTES").toString("base64")}`;
const FONT_DATA_URL = `data:font/woff2;base64,${Buffer.from("FONTBYTES").toString("base64")}`;

describe("parseDataUrl", () => {
  it("decodes a base64 data URL into mime + bytes", () => {
    const parsed = parseDataUrl(PNG_DATA_URL);
    assert.ok(parsed);
    assert.equal(parsed!.mime, "image/png");
    assert.equal(parsed!.bytes.toString(), "PNGBYTES");
  });

  it("returns null for null / non-data values", () => {
    assert.equal(parseDataUrl(null), null);
    assert.equal(parseDataUrl(undefined), null);
    assert.equal(parseDataUrl("/api/brand-assets/u1/abc.png"), null);
    assert.equal(parseDataUrl("https://example.com/logo.png"), null);
  });

  it("returns null for an empty payload", () => {
    assert.equal(parseDataUrl("data:image/png;base64,"), null);
  });
});

// ---------------------------------------------------------------------------
// planBrandAssetMigration (pure)
// ---------------------------------------------------------------------------

function row(overrides: Partial<BrandMigrationRow>): BrandMigrationRow {
  return {
    id: "b1",
    ownerId: "u1",
    logoUrl: null,
    fontDataUrl: null,
    logoAssetId: null,
    fontAssetId: null,
    ...overrides,
  };
}

describe("planBrandAssetMigration", () => {
  it("plans one item per legacy data URL", () => {
    const plan = planBrandAssetMigration([
      row({ logoUrl: PNG_DATA_URL, fontDataUrl: FONT_DATA_URL }),
    ]);
    assert.equal(plan.items.length, 2);
    const kinds = plan.items.map((i) => i.kind).sort();
    assert.deepEqual(kinds, ["font", "logo"]);
    const logo = plan.items.find((i) => i.kind === "logo")!;
    assert.equal(logo.mime, "image/png");
    assert.equal(logo.storageKey, `u1/${logo.checksum}.png`);
    assert.equal(logo.byteSize, Buffer.from("PNGBYTES").byteLength);
  });

  it("skips fields already migrated (asset ref present)", () => {
    const plan = planBrandAssetMigration([
      row({ logoUrl: PNG_DATA_URL, logoAssetId: "already" }),
    ]);
    assert.equal(plan.items.length, 0);
    assert.equal(plan.skipped, 2);
  });

  it("skips non-data-URL values (e.g. already-protected URLs)", () => {
    const plan = planBrandAssetMigration([
      row({ logoUrl: "/api/brand-assets/u1/x.png" }),
    ]);
    assert.equal(plan.items.length, 0);
  });

  it("is deterministic — same checksum for same bytes", () => {
    const a = planBrandAssetMigration([row({ logoUrl: PNG_DATA_URL })]);
    const b = planBrandAssetMigration([row({ logoUrl: PNG_DATA_URL })]);
    assert.equal(a.items[0].checksum, b.items[0].checksum);
  });
});

// ---------------------------------------------------------------------------
// applyBrandAssetMigration — dry-run / apply / idempotency
// ---------------------------------------------------------------------------

interface MemStore {
  bytes: Map<string, Buffer>;
  assets: Map<string, { id: string; brandId: string }>;
  brands: Map<
    string,
    { logoAssetId: string | null; fontAssetId: string | null }
  >;
}

function makeDeps(store: MemStore): BrandMigrateDeps {
  return {
    async storeBytes(storageKey, bytes) {
      store.bytes.set(storageKey, bytes);
    },
    async upsertAsset(item) {
      const existing = store.assets.get(item.storageKey);
      if (existing) return existing.id;
      const id = `asset-${store.assets.size + 1}`;
      store.assets.set(item.storageKey, { id, brandId: item.brandId });
      return id;
    },
    async linkBrand(brandId, kind, assetId) {
      const b = store.brands.get(brandId) ?? {
        logoAssetId: null,
        fontAssetId: null,
      };
      if (kind === "logo") b.logoAssetId = assetId;
      else b.fontAssetId = assetId;
      store.brands.set(brandId, b);
    },
  };
}

function emptyStore(): MemStore {
  return { bytes: new Map(), assets: new Map(), brands: new Map() };
}

describe("applyBrandAssetMigration", () => {
  it("dry run reports counts and writes nothing", async () => {
    const store = emptyStore();
    const rows = [row({ logoUrl: PNG_DATA_URL, fontDataUrl: FONT_DATA_URL })];
    const result = await applyBrandAssetMigration(rows, makeDeps(store), {
      apply: false,
    });
    assert.equal(result.applied, false);
    assert.equal(result.planned, 2);
    assert.equal(result.changed, 2);
    assert.equal(result.failed, 0);
    assert.equal(store.bytes.size, 0);
    assert.equal(store.assets.size, 0);
  });

  it("apply writes bytes, creates assets, and links brands", async () => {
    const store = emptyStore();
    const rows = [row({ logoUrl: PNG_DATA_URL, fontDataUrl: FONT_DATA_URL })];
    const result = await applyBrandAssetMigration(rows, makeDeps(store), {
      apply: true,
    });
    assert.equal(result.applied, true);
    assert.equal(result.changed, 2);
    assert.equal(result.failed, 0);
    assert.equal(store.bytes.size, 2);
    assert.equal(store.assets.size, 2);
    const brand = store.brands.get("b1")!;
    assert.ok(brand.logoAssetId);
    assert.ok(brand.fontAssetId);
  });

  it("is idempotent — re-running with migrated rows changes 0", async () => {
    const store = emptyStore();
    const rows = [row({ logoUrl: PNG_DATA_URL })];
    await applyBrandAssetMigration(rows, makeDeps(store), { apply: true });

    // Simulate the post-migration row shape: asset ref set, legacy column cleared.
    const migrated = [row({ logoUrl: null, logoAssetId: "asset-1" })];
    const second = await applyBrandAssetMigration(migrated, makeDeps(store), {
      apply: true,
    });
    assert.equal(second.planned, 0);
    assert.equal(second.changed, 0);
  });

  it("counts a failing dependency without throwing", async () => {
    const store = emptyStore();
    const deps = makeDeps(store);
    deps.storeBytes = async () => {
      throw new Error("disk full");
    };
    const result = await applyBrandAssetMigration(
      [row({ logoUrl: PNG_DATA_URL })],
      deps,
      { apply: true },
    );
    assert.equal(result.failed, 1);
    assert.equal(result.changed, 0);
  });
});
