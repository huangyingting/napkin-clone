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
  MIME_TO_EXT,
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
  it("returns {documentId}/{checksum}.{ext} for image/png", () => {
    const key = deriveStorageKey("doc123", "deadbeef", "image/png");
    assert.equal(key, "doc123/deadbeef.png");
  });

  it("maps image/jpeg to .jpg extension", () => {
    const key = deriveStorageKey("d", "abc", "image/jpeg");
    assert.equal(key, "d/abc.jpg");
  });

  it("maps image/gif to .gif extension", () => {
    const key = deriveStorageKey("d", "abc", "image/gif");
    assert.equal(key, "d/abc.gif");
  });

  it("maps image/webp to .webp extension", () => {
    const key = deriveStorageKey("d", "abc", "image/webp");
    assert.equal(key, "d/abc.webp");
  });

  it("falls back to 'bin' for unknown MIME types", () => {
    const key = deriveStorageKey("d", "abc", "application/octet-stream");
    assert.equal(key, "d/abc.bin");
  });

  it("partitions keys by documentId so identical files in different docs differ", () => {
    const k1 = deriveStorageKey("docA", "ff00", "image/png");
    const k2 = deriveStorageKey("docB", "ff00", "image/png");
    assert.notEqual(k1, k2);
  });

  // Security: extension must come from the validated MIME type, not the filename.
  // A request with type=image/png and name=evil.html must produce .png, not .html.
  it("uses MIME-derived extension regardless of what filename the client supplied", () => {
    // The action validates MIME first, then passes meta.mimeType here.
    // This test documents the contract: extension = f(mimeType), not f(filename).
    const key = deriveStorageKey("doc1", "hash1", "image/png");
    assert.ok(
      key.endsWith(".png"),
      "extension must come from MIME, not filename",
    );
    assert.ok(
      !key.endsWith(".html"),
      "must never produce .html from image/png",
    );
  });

  it("rejects SVG-like extension by falling back to bin (SVG not in allowed MIME set)", () => {
    // image/svg+xml is not an accepted slide image type; the action rejects it
    // before reaching deriveStorageKey, but even if it slipped through the key
    // would get the safe 'bin' extension, not 'svg'.
    const key = deriveStorageKey("d", "abc", "image/svg+xml");
    assert.equal(key, "d/abc.bin");
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

// ---------------------------------------------------------------------------
// MIME_TO_EXT coverage
// ---------------------------------------------------------------------------

describe("MIME_TO_EXT", () => {
  it("covers all accepted slide image MIME types", () => {
    const expected = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    for (const mime of expected) {
      assert.ok(mime in MIME_TO_EXT, `MIME_TO_EXT must include ${mime}`);
    }
  });

  it("does not include SVG or HTML MIME types (security)", () => {
    assert.equal(MIME_TO_EXT["image/svg+xml"], undefined);
    assert.equal(MIME_TO_EXT["text/html"], undefined);
  });
});
