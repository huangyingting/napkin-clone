/**
 * Tests for the slide asset upload action logic (Epic #374).
 *
 * The server action itself (`uploadSlideAsset`) requires Prisma and Next.js
 * infrastructure, so these tests exercise the pure building blocks it uses:
 *
 *  - SHA-256 checksum computation (Node crypto)
 *  - `validateAssetUpload` + `buildAssetMeta` pipeline (imported from
 *    `asset-upload.ts`, already covered in depth by `asset-upload.test.ts`
 *    but re-exercised here in the server-action context)
 *  - `deriveStorageKey` — the storage key derivation that determines the
 *    final `storageKey` column value and dedup uniqueness
 *  - Extension-mismatch security: keys must use MIME-derived extension
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildAssetMeta,
  validateAssetUpload,
  ASSET_MAX_BYTES,
} from "@/lib/slides/asset-upload";
import {
  imageDimensionsFromBytes,
  validateAssetDimensionsPolicy,
  validateAssetMagicBytes,
} from "@/lib/assets/upload-policy";
import { SLIDE_ASSET_UPLOAD_POLICY } from "@/lib/slides/asset-policy";
import {
  deriveStorageKey,
  setDefaultStorageAdapter,
  resetDefaultStorageAdapter,
} from "@/lib/slides/asset-storage";
import { withP2002Fallback } from "@/lib/db/p2002-fallback";

function createGifBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    width & 0xff,
    (width >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
    0x00,
    0x00,
    0x00,
  ]);
}

function createWebpVp8XBytes(width: number, height: number): Uint8Array {
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    22,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x58,
    10,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ]);
}

// ---------------------------------------------------------------------------
// SHA-256 checksum computation
// ---------------------------------------------------------------------------

describe("SHA-256 checksum", () => {
  it("produces a 64-character hex digest", () => {
    const buf = Buffer.from("hello world");
    const digest = createHash("sha256").update(buf).digest("hex");
    assert.equal(digest.length, 64);
    assert.match(digest, /^[0-9a-f]+$/);
  });

  it("is deterministic for the same bytes", () => {
    const buf = Buffer.from("slide-asset-bytes");
    const a = createHash("sha256").update(buf).digest("hex");
    const b = createHash("sha256").update(buf).digest("hex");
    assert.equal(a, b);
  });

  it("differs for different byte sequences", () => {
    const a = createHash("sha256").update(Buffer.from("aaa")).digest("hex");
    const b = createHash("sha256").update(Buffer.from("bbb")).digest("hex");
    assert.notEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// Validation + metadata pipeline (upload action path)
// ---------------------------------------------------------------------------

describe("upload action validation pipeline", () => {
  it("accepts a valid PNG within size limit", () => {
    const v = validateAssetUpload("image/png", "slide.png", 1024);
    assert.ok(v.ok);

    const m = buildAssetMeta({
      type: "image/png",
      name: "slide.png",
      size: 1024,
      checksum: "abc123",
    });
    assert.ok(m.ok);
    assert.equal(m.meta.mimeType, "image/png");
    assert.equal(m.meta.checksum, "abc123");
    assert.equal(m.meta.byteSize, 1024);
  });

  it("rejects files over the limit before computing checksum", () => {
    const v = validateAssetUpload("image/png", "big.png", ASSET_MAX_BYTES + 1);
    assert.ok(!v.ok);
    assert.equal(v.error.code, "file_too_large");
  });

  it("rejects unsupported MIME types", () => {
    const v = validateAssetUpload("application/pdf", "deck.pdf", 100);
    assert.ok(!v.ok);
    assert.equal(v.error.code, "type_rejected");
  });

  it("rejects SVG MIME type", () => {
    const v = validateAssetUpload("image/svg+xml", "image.svg", 100);
    assert.ok(!v.ok);
    assert.equal(v.error.code, "type_rejected");
  });

  it("rejects text/html MIME type", () => {
    const v = validateAssetUpload("text/html", "page.html", 100);
    assert.ok(!v.ok);
    assert.equal(v.error.code, "type_rejected");
  });

  it("rejects oversized GIF/WebP dimensions before storage", () => {
    const maxPx = SLIDE_ASSET_UPLOAD_POLICY.dimensions!.maxPx;
    const oversizedUploads = [
      {
        mime: "image/gif",
        name: "anim.gif",
        bytes: createGifBytes(maxPx + 1, 10),
      },
      {
        mime: "image/webp",
        name: "photo.webp",
        bytes: createWebpVp8XBytes(10, maxPx + 1),
      },
    ] as const;

    for (const upload of oversizedUploads) {
      const validated = validateAssetUpload(
        upload.mime,
        upload.name,
        upload.bytes.length,
      );
      assert.ok(validated.ok);
      if (!validated.ok) continue;

      assert.deepEqual(validateAssetMagicBytes(validated.mime, upload.bytes), {
        ok: true,
      });
      const dimensions = imageDimensionsFromBytes(validated.mime, upload.bytes);
      const dimensionCheck = validateAssetDimensionsPolicy(
        SLIDE_ASSET_UPLOAD_POLICY,
        dimensions.widthPx,
        dimensions.heightPx,
      );
      assert.ok(!dimensionCheck.ok);
      if (!dimensionCheck.ok) {
        assert.equal(dimensionCheck.error.code, "dimension_exceeded");
      }
    }
  });

  it("keeps extracted GIF/WebP dimensions in upload metadata", () => {
    const uploads = [
      { mime: "image/gif", name: "anim.gif", bytes: createGifBytes(320, 180) },
      {
        mime: "image/webp",
        name: "hero.webp",
        bytes: createWebpVp8XBytes(640, 360),
      },
    ] as const;

    for (const upload of uploads) {
      const dimensions = imageDimensionsFromBytes(upload.mime, upload.bytes);
      const meta = buildAssetMeta({
        type: upload.mime,
        name: upload.name,
        size: upload.bytes.length,
        checksum: "abc123",
        widthPx: dimensions.widthPx,
        heightPx: dimensions.heightPx,
      });
      assert.ok(meta.ok);
      if (!meta.ok) continue;

      assert.equal(meta.meta.widthPx, dimensions.widthPx);
      assert.equal(meta.meta.heightPx, dimensions.heightPx);
    }
  });
});

// ---------------------------------------------------------------------------
// deriveStorageKey — MIME-based extension (security)
// ---------------------------------------------------------------------------

describe("deriveStorageKey (upload action key shape)", () => {
  it("produces a scoped key that embeds documentId and checksum", () => {
    const checksum = createHash("sha256")
      .update(Buffer.from("bytes"))
      .digest("hex");
    const key = deriveStorageKey("docABC", checksum, "image/jpeg");
    assert.ok(key.startsWith("docABC/"), "key must be scoped by documentId");
    assert.ok(key.includes(checksum), "key must embed the checksum");
    assert.ok(key.endsWith(".jpg"), "key must use MIME-derived extension");
  });

  it("two documents with identical file content get different keys (dedup scoped to document)", () => {
    const checksum = "ff00ff";
    const k1 = deriveStorageKey("doc1", checksum, "image/png");
    const k2 = deriveStorageKey("doc2", checksum, "image/png");
    assert.notEqual(k1, k2, "keys must differ across documents");
  });

  // Security: a client that sends type=image/png with name=evil.html must not
  // produce an .html key.  The action validates MIME first and passes
  // meta.mimeType (not fileEntry.name) to deriveStorageKey.
  it("extension mismatch — image/png MIME always produces .png key regardless of filename", () => {
    const checksum = "abc123";
    // Simulates: fileEntry.type="image/png", fileEntry.name="evil.html"
    // Action passes meta.mimeType ("image/png") — filename is ignored.
    const key = deriveStorageKey("doc1", checksum, "image/png");
    assert.ok(
      key.endsWith(".png"),
      "must use MIME extension, not filename extension",
    );
    assert.ok(
      !key.includes(".html"),
      "must not produce .html under any circumstance",
    );
  });
});

// ---------------------------------------------------------------------------
// In-memory adapter dedup simulation
// ---------------------------------------------------------------------------

describe("upload dedup via in-memory adapter", () => {
  const stored: Map<string, Buffer> = new Map();

  const adapter = {
    async store(
      key: string,
      buffer: Buffer,
      _mimeType?: string,
    ): Promise<string> {
      stored.set(key, buffer);
      return `/assets/${key}`;
    },
    urlFor(key: string): string {
      return `/assets/${key}`;
    },
    async read(key: string): Promise<Buffer> {
      const buf = stored.get(key);
      if (!buf) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
      return buf;
    },
    async delete(key: string): Promise<void> {
      stored.delete(key);
    },
  };

  it("stores asset on first upload and returns URL", async () => {
    setDefaultStorageAdapter(adapter);
    const key = deriveStorageKey("docX", "hash1", "image/png");
    const url = await adapter.store(key, Buffer.from("pixels"), "image/png");
    assert.equal(url, `/assets/${key}`);
    assert.ok(stored.has(key));
    resetDefaultStorageAdapter();
  });

  it("urlFor returns URL for an existing key without writing", () => {
    const key = deriveStorageKey("docX", "hash2", "image/webp");
    const url = adapter.urlFor(key);
    assert.equal(url, `/assets/${key}`);
    assert.ok(!stored.has(key), "urlFor must not write any bytes");
  });
});

// ---------------------------------------------------------------------------
// P2002 recovery
// ---------------------------------------------------------------------------

describe("upload action P2002 recovery", () => {
  it("returns the concurrently-created asset when create hits a unique race", async () => {
    const winner = { id: "asset-winner" };
    const result = await withP2002Fallback(
      async () => {
        throw Object.assign(new Error("unique constraint"), { code: "P2002" });
      },
      async () => winner,
    );

    assert.equal(result, winner);
  });

  it("rethrows P2002 when no winning asset can be recovered", async () => {
    const p2002 = Object.assign(new Error("unique constraint"), {
      code: "P2002",
    });

    await assert.rejects(
      () =>
        withP2002Fallback(
          async () => {
            throw p2002;
          },
          async () => null,
        ),
      (error) => error === p2002,
    );
  });
});
