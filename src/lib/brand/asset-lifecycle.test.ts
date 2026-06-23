/**
 * Tests for brand asset storage + access + orphan/cleanup (Epic #496).
 *
 * DOM-free: runs under `node --import tsx --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { decideBrandAssetAccess } from "@/lib/brand/asset-access";
import {
  BRAND_MIME_TO_EXT,
  deriveBrandStorageKey,
} from "@/lib/brand/asset-storage";
import { toBrandStyle, type BrandRow } from "@/lib/brand/serialize";
import {
  BRAND_ASSET_RETENTION_MS,
  reconcileBrandAssets,
  purgeExpiredBrandAssets,
  selectBrandOrphanIds,
  type BrandOrphanDb,
  type BrandOrphanStorage,
} from "@/lib/brand/asset-orphan";

// ---------------------------------------------------------------------------
// decideBrandAssetAccess
// ---------------------------------------------------------------------------

describe("decideBrandAssetAccess", () => {
  const asset = { id: "a1" };

  it("404 when the asset does not exist (privacy)", () => {
    const d = decideBrandAssetAccess({
      asset: null,
      requestedOwnerId: "u1",
      userId: "u1",
    });
    assert.equal(d.allow, false);
    if (!d.allow) {
      assert.equal(d.status, 404);
      assert.equal(d.reason, "asset-not-found");
    }
  });

  it("401 when unauthenticated", () => {
    const d = decideBrandAssetAccess({
      asset,
      requestedOwnerId: "u1",
      userId: null,
    });
    assert.equal(d.allow, false);
    if (!d.allow) assert.equal(d.status, 401);
  });

  it("403 when authenticated but not the partition owner", () => {
    const d = decideBrandAssetAccess({
      asset,
      requestedOwnerId: "u1",
      userId: "u2",
    });
    assert.equal(d.allow, false);
    if (!d.allow) {
      assert.equal(d.status, 403);
      assert.equal(d.reason, "forbidden");
    }
  });

  it("allows the partition owner", () => {
    const d = decideBrandAssetAccess({
      asset,
      requestedOwnerId: "u1",
      userId: "u1",
    });
    assert.equal(d.allow, true);
  });

  it("missing-asset 404 is never downgraded to 403 for a non-owner", () => {
    const d = decideBrandAssetAccess({
      asset: null,
      requestedOwnerId: "u1",
      userId: "u2",
    });
    assert.equal(d.allow, false);
    if (!d.allow) assert.equal(d.status, 404);
  });
});

// ---------------------------------------------------------------------------
// deriveBrandStorageKey
// ---------------------------------------------------------------------------

describe("deriveBrandStorageKey", () => {
  it("partitions by ownerId and derives extension from MIME", () => {
    assert.equal(
      deriveBrandStorageKey("owner1", "abc123", "image/png"),
      "owner1/abc123.png",
    );
    assert.equal(
      deriveBrandStorageKey("owner1", "def", "font/woff2"),
      "owner1/def.woff2",
    );
    assert.equal(
      deriveBrandStorageKey("owner1", "ghi", "image/svg+xml"),
      "owner1/ghi.svg",
    );
  });

  it("falls back to bin for unknown MIME (never the filename)", () => {
    assert.equal(
      deriveBrandStorageKey("o", "x", "application/octet-stream"),
      "o/x.bin",
    );
    assert.equal(deriveBrandStorageKey("o", "x", "weird/type"), "o/x.bin");
  });

  it("covers all accepted logo + font MIME types", () => {
    for (const mime of Object.keys(BRAND_MIME_TO_EXT)) {
      const key = deriveBrandStorageKey("o", "c", mime);
      assert.match(key, /^o\/c\.[a-z0-9]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// toBrandStyle — derives protected URLs from asset refs
// ---------------------------------------------------------------------------

describe("toBrandStyle", () => {
  const baseRow: BrandRow = {
    id: "b1",
    name: "Acme",
    ownerId: "u1",
    palette: ["#ff0000"],
    background: null,
    nodeFill: null,
    nodeStroke: null,
    nodeText: null,
    edgeColor: null,
    fontFamily: null,
    logoAssetId: null,
    fontAssetId: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  };

  it("derives logo/font URLs from the asset map", () => {
    const map = new Map([
      ["la", "/api/brand-assets/u1/aaa.png"],
      ["fa", "/api/brand-assets/u1/bbb.woff2"],
    ]);
    const style = toBrandStyle(
      { ...baseRow, logoAssetId: "la", fontAssetId: "fa" },
      map,
    );
    assert.equal(style.logoUrl, "/api/brand-assets/u1/aaa.png");
    assert.equal(style.fontDataUrl, "/api/brand-assets/u1/bbb.woff2");
    assert.equal(style.logoAssetId, "la");
    assert.equal(style.fontAssetId, "fa");
  });

  it("null URLs when no asset ref is set", () => {
    const style = toBrandStyle(baseRow, new Map());
    assert.equal(style.logoUrl, null);
    assert.equal(style.fontDataUrl, null);
  });

  it("null URL when the referenced asset is missing from the map (purged)", () => {
    const style = toBrandStyle({ ...baseRow, logoAssetId: "gone" }, new Map());
    assert.equal(style.logoUrl, null);
    assert.equal(style.logoAssetId, "gone");
  });
});

// ---------------------------------------------------------------------------
// selectBrandOrphanIds (pure)
// ---------------------------------------------------------------------------

describe("selectBrandOrphanIds", () => {
  it("returns assets not in the live reference set", () => {
    const live = new Set(["keep"]);
    const orphans = selectBrandOrphanIds(live, [
      { id: "keep" },
      { id: "drop1" },
      { id: "drop2" },
    ]);
    assert.deepEqual(orphans.sort(), ["drop1", "drop2"]);
  });

  it("returns empty when all assets are referenced", () => {
    const live = new Set(["a", "b"]);
    assert.deepEqual(
      selectBrandOrphanIds(live, [{ id: "a" }, { id: "b" }]),
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// In-memory DB harness for reconcile / purge
// ---------------------------------------------------------------------------

interface MemAsset {
  id: string;
  brandId: string | null;
  documentId: string | null;
  workspaceId: string | null;
  storageKey: string;
  deletedAt: Date | null;
}

function makeDb(
  brand: { logoAssetId: string | null; fontAssetId: string | null } | null,
  assets: MemAsset[],
): { db: BrandOrphanDb; assets: MemAsset[] } {
  const db: BrandOrphanDb = {
    brand: {
      async findUnique() {
        return brand
          ? { logoAssetId: brand.logoAssetId, fontAssetId: brand.fontAssetId }
          : null;
      },
    },
    asset: {
      async findMany(args) {
        const w = args.where;
        if ("brandId" in w) {
          return assets
            .filter((a) => a.brandId === w.brandId && a.deletedAt === null)
            .map((a) => ({ id: a.id }));
        }
        // purge query
        const lt = w.deletedAt.lt;
        return assets
          .filter(
            (a) =>
              a.documentId === null &&
              a.workspaceId === null &&
              a.deletedAt !== null &&
              a.deletedAt < lt,
          )
          .map((a) => ({ id: a.id, storageKey: a.storageKey }));
      },
      async updateMany(args) {
        let count = 0;
        for (const a of assets) {
          if (args.where.id.in.includes(a.id)) {
            a.deletedAt = args.data.deletedAt;
            count += 1;
          }
        }
        return { count };
      },
      async deleteMany(args) {
        let count = 0;
        for (let i = assets.length - 1; i >= 0; i -= 1) {
          if (args.where.id.in.includes(assets[i].id)) {
            assets.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
  };
  return { db, assets };
}

describe("reconcileBrandAssets", () => {
  it("soft-deletes brand assets no longer referenced (replaced logo)", async () => {
    const assets: MemAsset[] = [
      {
        id: "old-logo",
        brandId: "b1",
        documentId: null,
        workspaceId: null,
        storageKey: "u1/old.png",
        deletedAt: null,
      },
      {
        id: "new-logo",
        brandId: "b1",
        documentId: null,
        workspaceId: null,
        storageKey: "u1/new.png",
        deletedAt: null,
      },
    ];
    const { db } = makeDb(
      { logoAssetId: "new-logo", fontAssetId: null },
      assets,
    );
    const count = await reconcileBrandAssets("b1", db, new Date());
    assert.equal(count, 1);
    assert.equal(
      assets.find((a) => a.id === "old-logo")!.deletedAt !== null,
      true,
    );
    assert.equal(assets.find((a) => a.id === "new-logo")!.deletedAt, null);
  });

  it("is idempotent — re-running orphans nothing new", async () => {
    const assets: MemAsset[] = [
      {
        id: "logo",
        brandId: "b1",
        documentId: null,
        workspaceId: null,
        storageKey: "u1/l.png",
        deletedAt: null,
      },
    ];
    const { db } = makeDb({ logoAssetId: "logo", fontAssetId: null }, assets);
    assert.equal(await reconcileBrandAssets("b1", db), 0);
    assert.equal(await reconcileBrandAssets("b1", db), 0);
  });

  it("returns 0 for a missing brand", async () => {
    const { db } = makeDb(null, []);
    assert.equal(await reconcileBrandAssets("gone", db), 0);
  });
});

describe("purgeExpiredBrandAssets", () => {
  const now = new Date("2026-01-10T00:00:00.000Z");
  const expiredAt = new Date(now.getTime() - BRAND_ASSET_RETENTION_MS - 1000);
  const recentAt = new Date(now.getTime() - 1000);

  function storage(deleted: string[]): BrandOrphanStorage {
    return {
      async delete(key) {
        deleted.push(key);
      },
    };
  }

  it("purges soft-deleted brand-origin assets past the retention window", async () => {
    const assets: MemAsset[] = [
      {
        id: "expired",
        brandId: null,
        documentId: null,
        workspaceId: null,
        storageKey: "u1/expired.png",
        deletedAt: expiredAt,
      },
      {
        id: "recent",
        brandId: null,
        documentId: null,
        workspaceId: null,
        storageKey: "u1/recent.png",
        deletedAt: recentAt,
      },
    ];
    const { db } = makeDb(null, assets);
    const deleted: string[] = [];
    const count = await purgeExpiredBrandAssets(
      db,
      storage(deleted),
      BRAND_ASSET_RETENTION_MS,
      now,
    );
    assert.equal(count, 1);
    assert.deepEqual(deleted, ["u1/expired.png"]);
    assert.equal(
      assets.some((a) => a.id === "expired"),
      false,
    );
    assert.equal(
      assets.some((a) => a.id === "recent"),
      true,
    );
  });

  it("does not purge document-scoped (slide) assets", async () => {
    const assets: MemAsset[] = [
      {
        id: "slide",
        brandId: null,
        documentId: "doc1",
        workspaceId: null,
        storageKey: "doc1/x.png",
        deletedAt: expiredAt,
      },
    ];
    const { db } = makeDb(null, assets);
    const deleted: string[] = [];
    const count = await purgeExpiredBrandAssets(
      db,
      storage(deleted),
      BRAND_ASSET_RETENTION_MS,
      now,
    );
    assert.equal(count, 0);
    assert.deepEqual(deleted, []);
  });
});
