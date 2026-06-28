import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateAssetChecksum,
  storeAssetWithUpsert,
  type ExistingStoredAsset,
} from "@/lib/assets/store";
import type { AssetStorageAdapter } from "@/lib/assets/storage";

function memoryStorage(writes: string[]): AssetStorageAdapter {
  return {
    async store(key) {
      writes.push(key);
      return `/api/assets/${key}`;
    },
    urlFor(key) {
      return `/api/assets/${key}`;
    },
    async read() {
      return Buffer.from("");
    },
    async delete() {},
  };
}

describe("calculateAssetChecksum", () => {
  it("returns a stable SHA-256 hex digest", () => {
    assert.equal(
      calculateAssetChecksum(Buffer.from("abc")),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("storeAssetWithUpsert", () => {
  it("stores new bytes and creates an asset row with a MIME-derived key", async () => {
    const writes: string[] = [];
    const created: unknown[] = [];

    const result = await storeAssetWithUpsert({
      scopeId: "doc1",
      buffer: Buffer.from("pixels"),
      mimeType: "image/png",
      originalName: "image.png",
      mimeToExt: { "image/png": "png" },
      storage: memoryStorage(writes),
      findExisting: async () => null,
      createAsset: async (input) => {
        created.push(input);
        return { id: "asset-new" };
      },
      findAfterConflict: async () => null,
    });

    assert.equal(result.assetId, "asset-new");
    assert.equal(writes.length, 1);
    assert.equal(writes[0], result.storageKey);
    assert.equal(result.storageKey, `doc1/${result.checksum}.png`);
    assert.equal(created.length, 1);
  });

  it("returns an existing asset without rewriting when lookup happens first", async () => {
    const writes: string[] = [];
    const existing: ExistingStoredAsset = {
      id: "asset-existing",
      storageKey: "doc1/existing.png",
    };

    const result = await storeAssetWithUpsert({
      scopeId: "doc1",
      buffer: Buffer.from("pixels"),
      mimeType: "image/png",
      mimeToExt: { "image/png": "png" },
      storage: memoryStorage(writes),
      findExisting: async () => existing,
      createAsset: async () => {
        throw new Error("should not create");
      },
      findAfterConflict: async () => null,
    });

    assert.equal(result.assetId, "asset-existing");
    assert.equal(result.url, "/api/assets/doc1/existing.png");
    assert.deepEqual(writes, []);
  });

  it("can write before lookup and refresh metadata for an existing asset", async () => {
    const writes: string[] = [];
    const updates: unknown[] = [];
    const existing: ExistingStoredAsset = {
      id: "asset-existing",
      storageKey: "doc1/existing.png",
    };

    const result = await storeAssetWithUpsert({
      scopeId: "doc1",
      buffer: Buffer.from("pixels"),
      mimeType: "image/png",
      originalName: "renamed.png",
      mimeToExt: { "image/png": "png" },
      storage: memoryStorage(writes),
      storeBeforeFind: true,
      findExisting: async () => existing,
      updateExisting: async (_existing, input) => {
        updates.push(input);
      },
      createAsset: async () => {
        throw new Error("should not create");
      },
      findAfterConflict: async () => null,
    });

    assert.equal(result.assetId, "asset-existing");
    assert.equal(result.url, `/api/assets/${writes[0]}`);
    assert.equal(result.storageKey, "doc1/existing.png");
    assert.equal(updates.length, 1);
  });

  it("recovers from a P2002 race via the shared DB fallback", async () => {
    const result = await storeAssetWithUpsert({
      scopeId: "brand-owner",
      buffer: Buffer.from("logo"),
      mimeType: "image/webp",
      mimeToExt: { "image/webp": "webp" },
      storage: memoryStorage([]),
      findExisting: async () => null,
      createAsset: async () => {
        const error = new Error("race") as Error & { code: string };
        error.code = "P2002";
        throw error;
      },
      findAfterConflict: async () => ({ id: "winner" }),
    });

    assert.equal(result.assetId, "winner");
  });
});
