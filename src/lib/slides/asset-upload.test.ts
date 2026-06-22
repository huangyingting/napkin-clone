/**
 * Unit tests for slide asset upload validation helpers (Epic #374).
 *
 * Tests: MIME type resolution, size limits, dimension limits,
 * metadata builder, error formatter, and invalid/edge cases.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateAssetUpload,
  validateAssetDimensions,
  buildAssetMeta,
  formatAssetUploadError,
  resolveAssetMime,
  isAcceptedSlideImageType,
  ASSET_MAX_BYTES,
  ASSET_MAX_DIMENSION_PX,
  SLIDE_IMAGE_TYPES,
} from "@/lib/slides/asset-upload";

// ---------------------------------------------------------------------------
// resolveAssetMime
// ---------------------------------------------------------------------------

describe("resolveAssetMime", () => {
  it("returns the provided MIME type when it is not octet-stream", () => {
    assert.equal(resolveAssetMime("image/png", "photo.png"), "image/png");
    assert.equal(resolveAssetMime("image/webp", "image.webp"), "image/webp");
  });

  it("falls back to extension sniffing for octet-stream", () => {
    assert.equal(
      resolveAssetMime("application/octet-stream", "photo.png"),
      "image/png",
    );
    assert.equal(
      resolveAssetMime("application/octet-stream", "image.jpg"),
      "image/jpeg",
    );
    assert.equal(
      resolveAssetMime("application/octet-stream", "anim.gif"),
      "image/gif",
    );
    assert.equal(
      resolveAssetMime("application/octet-stream", "icon.svg"),
      "image/svg+xml",
    );
    assert.equal(
      resolveAssetMime("application/octet-stream", "image.webp"),
      "image/webp",
    );
  });

  it("falls back to extension sniffing for empty string type", () => {
    assert.equal(resolveAssetMime("", "photo.jpeg"), "image/jpeg");
  });

  it("returns original type for unknown extension with octet-stream", () => {
    assert.equal(
      resolveAssetMime("application/octet-stream", "file.xyz"),
      "application/octet-stream",
    );
  });
});

// ---------------------------------------------------------------------------
// isAcceptedSlideImageType
// ---------------------------------------------------------------------------

describe("isAcceptedSlideImageType", () => {
  it("accepts all slide image types", () => {
    for (const mime of SLIDE_IMAGE_TYPES) {
      assert.ok(isAcceptedSlideImageType(mime), `should accept ${mime}`);
    }
  });

  it("rejects non-image MIME types", () => {
    assert.equal(isAcceptedSlideImageType("application/pdf"), false);
    assert.equal(isAcceptedSlideImageType("video/mp4"), false);
    assert.equal(isAcceptedSlideImageType("font/ttf"), false);
    assert.equal(isAcceptedSlideImageType(""), false);
  });
});

// ---------------------------------------------------------------------------
// validateAssetUpload — happy path
// ---------------------------------------------------------------------------

describe("validateAssetUpload — happy path", () => {
  it("accepts a PNG within size limit", () => {
    const result = validateAssetUpload("image/png", "hero.png", 1024);
    assert.ok(result.ok);
    assert.equal(result.mime, "image/png");
    assert.equal(result.byteSize, 1024);
  });

  it("accepts a JPEG within size limit", () => {
    const result = validateAssetUpload("image/jpeg", "photo.jpg", 500_000);
    assert.ok(result.ok);
    assert.equal(result.mime, "image/jpeg");
  });

  it("accepts an SVG", () => {
    const result = validateAssetUpload("image/svg+xml", "logo.svg", 2048);
    assert.ok(result.ok);
    assert.equal(result.mime, "image/svg+xml");
  });

  it("accepts a file exactly at the size limit", () => {
    const result = validateAssetUpload("image/png", "big.png", ASSET_MAX_BYTES);
    assert.ok(result.ok);
  });

  it("resolves MIME from extension when type is octet-stream", () => {
    const result = validateAssetUpload(
      "application/octet-stream",
      "slide.webp",
      4096,
    );
    assert.ok(result.ok);
    assert.equal(result.mime, "image/webp");
  });
});

// ---------------------------------------------------------------------------
// validateAssetUpload — rejection cases
// ---------------------------------------------------------------------------

describe("validateAssetUpload — rejections", () => {
  it("rejects files over the size limit", () => {
    const result = validateAssetUpload(
      "image/png",
      "huge.png",
      ASSET_MAX_BYTES + 1,
    );
    assert.ok(!result.ok);
    assert.equal(result.error.code, "file_too_large");
    assert.equal(
      (result.error as { code: "file_too_large"; maxBytes: number }).maxBytes,
      ASSET_MAX_BYTES,
    );
  });

  it("rejects unsupported MIME type", () => {
    const result = validateAssetUpload("application/pdf", "deck.pdf", 1024);
    assert.ok(!result.ok);
    assert.equal(result.error.code, "type_rejected");
  });

  it("rejects video MIME type", () => {
    const result = validateAssetUpload("video/mp4", "clip.mp4", 1024);
    assert.ok(!result.ok);
    assert.equal(result.error.code, "type_rejected");
  });

  it("rejects font MIME type", () => {
    const result = validateAssetUpload("font/woff2", "font.woff2", 1024);
    assert.ok(!result.ok);
    assert.equal(result.error.code, "type_rejected");
  });

  it("size check runs before MIME check", () => {
    // Oversized + wrong type → should fail on size first
    const result = validateAssetUpload(
      "application/pdf",
      "big.pdf",
      ASSET_MAX_BYTES + 1,
    );
    assert.ok(!result.ok);
    assert.equal(result.error.code, "file_too_large");
  });
});

// ---------------------------------------------------------------------------
// validateAssetDimensions
// ---------------------------------------------------------------------------

describe("validateAssetDimensions", () => {
  it("accepts typical raster dimensions", () => {
    const r = validateAssetDimensions(1920, 1080);
    assert.ok(r.ok);
  });

  it("accepts SVG with undefined dimensions", () => {
    const r = validateAssetDimensions(undefined, undefined);
    assert.ok(r.ok);
  });

  it("accepts exactly at the max dimension", () => {
    const r = validateAssetDimensions(ASSET_MAX_DIMENSION_PX, 100);
    assert.ok(r.ok);
  });

  it("rejects width exceeding max", () => {
    const r = validateAssetDimensions(ASSET_MAX_DIMENSION_PX + 1, 100);
    assert.ok(!r.ok);
    assert.equal(r.error.code, "dimension_exceeded");
  });

  it("rejects height exceeding max", () => {
    const r = validateAssetDimensions(100, ASSET_MAX_DIMENSION_PX + 1);
    assert.ok(!r.ok);
    assert.equal(r.error.code, "dimension_exceeded");
  });
});

// ---------------------------------------------------------------------------
// buildAssetMeta
// ---------------------------------------------------------------------------

describe("buildAssetMeta", () => {
  it("builds metadata for a raster image", () => {
    const meta = buildAssetMeta({
      type: "image/png",
      name: "slide-bg.png",
      size: 204_800,
      checksum: "abc123",
      widthPx: 1920,
      heightPx: 1080,
    });
    assert.equal(meta.mimeType, "image/png");
    assert.equal(meta.byteSize, 204_800);
    assert.equal(meta.checksum, "abc123");
    assert.equal(meta.widthPx, 1920);
    assert.equal(meta.heightPx, 1080);
    assert.equal(meta.originalName, "slide-bg.png");
  });

  it("builds metadata for an SVG (no dimensions)", () => {
    const meta = buildAssetMeta({
      type: "image/svg+xml",
      name: "icon.svg",
      size: 512,
      checksum: "deadbeef",
    });
    assert.equal(meta.mimeType, "image/svg+xml");
    assert.equal(meta.widthPx, undefined);
    assert.equal(meta.heightPx, undefined);
  });

  it("resolves MIME from extension via octet-stream", () => {
    const meta = buildAssetMeta({
      type: "application/octet-stream",
      name: "image.webp",
      size: 1024,
      checksum: "ff00",
    });
    assert.equal(meta.mimeType, "image/webp");
  });

  it("omits originalName when name is empty string", () => {
    const meta = buildAssetMeta({
      type: "image/png",
      name: "",
      size: 100,
      checksum: "00",
    });
    assert.equal(meta.originalName, undefined);
  });
});

// ---------------------------------------------------------------------------
// formatAssetUploadError
// ---------------------------------------------------------------------------

describe("formatAssetUploadError", () => {
  it("formats file_too_large error with MB value", () => {
    const msg = formatAssetUploadError({
      code: "file_too_large",
      maxBytes: ASSET_MAX_BYTES,
    });
    assert.ok(msg.includes("10 MB"), `Expected '10 MB' in: ${msg}`);
  });

  it("formats type_rejected error listing accepted types", () => {
    const msg = formatAssetUploadError({
      code: "type_rejected",
      accepted: SLIDE_IMAGE_TYPES,
    });
    assert.ok(msg.includes("image/png"), `Expected 'image/png' in: ${msg}`);
  });

  it("formats dimension_exceeded error", () => {
    const msg = formatAssetUploadError({
      code: "dimension_exceeded",
      maxPx: ASSET_MAX_DIMENSION_PX,
    });
    assert.ok(
      msg.includes(String(ASSET_MAX_DIMENSION_PX)),
      `Expected px value in: ${msg}`,
    );
  });

  it("formats checksum_missing error", () => {
    const msg = formatAssetUploadError({ code: "checksum_missing" });
    assert.ok(
      msg.toLowerCase().includes("checksum"),
      `Expected 'checksum' in: ${msg}`,
    );
  });
});
