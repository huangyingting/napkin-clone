/**
 * Unit tests for the slide asset storage adapter (Epic #374).
 *
 * Tests: LocalAssetStorageAdapter (store + urlFor), deriveStorageKey,
 * and the default-adapter singleton helpers.
 *
 * Files written by LocalAssetStorageAdapter go into
 * `src/lib/slides/__test_output__/slide-assets/` and are cleaned up after
 * each test so the working tree stays tidy.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalAssetStorageAdapter,
  deriveStorageKey,
  getDefaultStorageAdapter,
  resetDefaultStorageAdapter,
  setDefaultStorageAdapter,
} from "@/lib/slides/asset-storage";

// ---------------------------------------------------------------------------
// Test output directory
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.join(__dirname, "__test_output__", "slide-assets");
const TEST_BASE_URL = "/test-assets";

async function cleanTestRoot() {
  await fs.rm(TEST_ROOT, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// LocalAssetStorageAdapter
// ---------------------------------------------------------------------------

describe("LocalAssetStorageAdapter — store", () => {
  before(cleanTestRoot);
  after(cleanTestRoot);

  it("writes the buffer to {rootDir}/{key} and returns the public URL", async () => {
    const adapter = new LocalAssetStorageAdapter(TEST_ROOT, TEST_BASE_URL);
    const key = "doc1/abc123.png";
    const data = Buffer.from("fake-png-bytes");

    const url = await adapter.store(key, data, "image/png");

    assert.equal(url, `${TEST_BASE_URL}/${key}`);

    const written = await fs.readFile(path.join(TEST_ROOT, key));
    assert.deepEqual(written, data);
  });

  it("creates intermediate directories automatically", async () => {
    const adapter = new LocalAssetStorageAdapter(TEST_ROOT, TEST_BASE_URL);
    const key = "deep/nested/dir/file.webp";
    const data = Buffer.from([0x00, 0x01, 0x02]);

    await adapter.store(key, data, "image/webp");

    const stat = await fs.stat(path.join(TEST_ROOT, key));
    assert.ok(stat.isFile());
  });

  it("overwrites an existing file with new content", async () => {
    const adapter = new LocalAssetStorageAdapter(TEST_ROOT, TEST_BASE_URL);
    const key = "doc2/overwrite.gif";
    const first = Buffer.from("first");
    const second = Buffer.from("second");

    await adapter.store(key, first, "image/gif");
    await adapter.store(key, second, "image/gif");

    const written = await fs.readFile(path.join(TEST_ROOT, key));
    assert.equal(written.toString(), "second");
  });
});

// ---------------------------------------------------------------------------
// LocalAssetStorageAdapter — urlFor
// ---------------------------------------------------------------------------

describe("LocalAssetStorageAdapter — urlFor", () => {
  it("returns {baseUrl}/{key} without writing any file", () => {
    const adapter = new LocalAssetStorageAdapter(TEST_ROOT, TEST_BASE_URL);
    assert.equal(
      adapter.urlFor("docX/hash.png"),
      `${TEST_BASE_URL}/docX/hash.png`,
    );
  });

  it("handles keys with multiple path segments", () => {
    const adapter = new LocalAssetStorageAdapter(TEST_ROOT, "/assets");
    assert.equal(adapter.urlFor("a/b/c.webp"), "/assets/a/b/c.webp");
  });
});

// ---------------------------------------------------------------------------
// deriveStorageKey
// ---------------------------------------------------------------------------

describe("deriveStorageKey", () => {
  it("returns {documentId}/{checksum}.{ext}", () => {
    const key = deriveStorageKey("doc123", "deadbeef", "photo.png");
    assert.equal(key, "doc123/deadbeef.png");
  });

  it("lowercases the extension", () => {
    const key = deriveStorageKey("d", "abc", "IMAGE.PNG");
    assert.equal(key, "d/abc.png");
  });

  it("falls back to 'bin' for files with no extension", () => {
    const key = deriveStorageKey("d", "abc", "noextension");
    assert.equal(key, "d/abc.bin");
  });

  it("uses only the last extension segment", () => {
    const key = deriveStorageKey("d", "abc", "archive.tar.gz");
    assert.equal(key, "d/abc.gz");
  });

  it("partitions keys by documentId so identical files in different docs differ", () => {
    const k1 = deriveStorageKey("docA", "ff00", "img.jpg");
    const k2 = deriveStorageKey("docB", "ff00", "img.jpg");
    assert.notEqual(k1, k2);
  });
});

// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------

describe("getDefaultStorageAdapter / setDefaultStorageAdapter / resetDefaultStorageAdapter", () => {
  after(() => {
    // Leave the singleton reset so it does not bleed into the next test run.
    resetDefaultStorageAdapter();
  });

  it("returns a LocalAssetStorageAdapter with public/slide-assets root by default", () => {
    resetDefaultStorageAdapter();
    const adapter = getDefaultStorageAdapter();
    assert.ok(adapter instanceof LocalAssetStorageAdapter);
    assert.ok(
      (adapter as LocalAssetStorageAdapter).rootDir.endsWith(
        path.join("public", "slide-assets"),
      ),
    );
    assert.equal(
      (adapter as LocalAssetStorageAdapter).baseUrl,
      "/slide-assets",
    );
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    resetDefaultStorageAdapter();
    const a = getDefaultStorageAdapter();
    const b = getDefaultStorageAdapter();
    assert.equal(a, b);
  });

  it("setDefaultStorageAdapter replaces the singleton", () => {
    const mock: import("@/lib/slides/asset-storage").AssetStorageAdapter = {
      async store() {
        return "https://cdn.example.com/key";
      },
      urlFor() {
        return "https://cdn.example.com/key";
      },
    };
    setDefaultStorageAdapter(mock);
    assert.equal(getDefaultStorageAdapter(), mock);
    resetDefaultStorageAdapter();
  });

  it("resetDefaultStorageAdapter causes re-initialisation on next call", () => {
    resetDefaultStorageAdapter();
    const before = getDefaultStorageAdapter();
    resetDefaultStorageAdapter();
    const after = getDefaultStorageAdapter();
    // Both are LocalAssetStorageAdapters but separate instances.
    assert.ok(before !== after);
  });
});
