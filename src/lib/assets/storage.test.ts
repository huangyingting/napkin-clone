import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveAssetStorageKey,
  LocalAssetStorageAdapter,
} from "@/lib/assets/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.join(__dirname, "__test_output__", "assets-storage");

describe("neutral LocalAssetStorageAdapter", () => {
  before(async () => {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  after(async () => {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  it("stores, reads, urls, and deletes through the neutral adapter contract", async () => {
    const adapter = new LocalAssetStorageAdapter(TEST_ROOT, "/api/test-assets");
    const key = "scope/checksum.png";
    const bytes = Buffer.from("asset-bytes");

    const url = await adapter.store(key, bytes, "image/png");
    assert.equal(url, "/api/test-assets/scope/checksum.png");
    assert.deepEqual(await adapter.read(key), bytes);

    await adapter.delete(key);
    await assert.rejects(
      () => adapter.read(key),
      (err: NodeJS.ErrnoException) => err.code === "ENOENT",
    );
  });
});

describe("deriveAssetStorageKey", () => {
  it("partitions by scope id and uses MIME-derived extensions", () => {
    const map = { "image/png": "png", "font/woff2": "woff2" };

    assert.equal(
      deriveAssetStorageKey("scope-a", "abc", "image/png", map),
      "scope-a/abc.png",
    );
    assert.equal(
      deriveAssetStorageKey("scope-a", "abc", "font/woff2", map),
      "scope-a/abc.woff2",
    );
    assert.equal(
      deriveAssetStorageKey("scope-a", "abc", "text/html", map),
      "scope-a/abc.bin",
    );
  });
});
