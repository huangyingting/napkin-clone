import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAssetPolicyMeta,
  formatAssetUploadPolicyError,
  imageDimensionsFromBytes,
  validateAssetDimensionsPolicy,
  validateAssetMagicBytes,
  validateAssetUploadPolicy,
} from "@/lib/assets/upload-policy";
import { BRAND_LOGO_UPLOAD_POLICY } from "@/lib/brand/asset-policy";
import { SLIDE_ASSET_UPLOAD_POLICY } from "@/lib/slides/asset-policy";

describe("asset upload policy validation", () => {
  it("keeps slide SVG rejected while accepting declared raster types", () => {
    const png = validateAssetUploadPolicy(
      SLIDE_ASSET_UPLOAD_POLICY,
      "image/png",
      "slide.png",
      1024,
    );
    assert.equal(png.ok, true);

    const svg = validateAssetUploadPolicy(
      SLIDE_ASSET_UPLOAD_POLICY,
      "image/svg+xml",
      "slide.svg",
      1024,
    );
    assert.equal(svg.ok, false);
    if (!svg.ok) assert.equal(svg.error.code, "type_rejected");
  });

  it("keeps brand logo SVG accepted by policy", () => {
    const svg = validateAssetUploadPolicy(
      BRAND_LOGO_UPLOAD_POLICY,
      "image/svg+xml",
      "logo.svg",
      1024,
    );
    assert.equal(svg.ok, true);
  });

  it("uses the shared file-too-large and dimension error formatting", () => {
    const tooLarge = validateAssetUploadPolicy(
      SLIDE_ASSET_UPLOAD_POLICY,
      "image/png",
      "big.png",
      SLIDE_ASSET_UPLOAD_POLICY.maxBytes + 1,
    );
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) {
      assert.equal(tooLarge.error.code, "file_too_large");
      assert.match(formatAssetUploadPolicyError(tooLarge.error), /10 MB/);
    }

    const dimensions = validateAssetDimensionsPolicy(
      SLIDE_ASSET_UPLOAD_POLICY,
      SLIDE_ASSET_UPLOAD_POLICY.dimensions!.maxPx + 1,
      undefined,
    );
    assert.equal(dimensions.ok, false);
    if (!dimensions.ok) {
      assert.equal(dimensions.error.code, "dimension_exceeded");
    }
  });

  it("builds metadata from a policy after checksum validation", () => {
    const result = buildAssetPolicyMeta({
      policy: SLIDE_ASSET_UPLOAD_POLICY,
      type: "application/octet-stream",
      name: "photo.webp",
      size: 512,
      checksum: "abc123",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.meta.mimeType, "image/webp");
      assert.equal(result.meta.originalName, "photo.webp");
    }
  });

  it("validates raster/font magic bytes and extracts PNG dimensions", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48,
      0x44, 0x52, 0, 0, 0x01, 0x00, 0, 0, 0x02, 0x00,
    ]);
    assert.deepEqual(validateAssetMagicBytes("image/png", png), { ok: true });
    assert.deepEqual(imageDimensionsFromBytes("image/png", png), {
      widthPx: 256,
      heightPx: 512,
    });

    assert.deepEqual(
      validateAssetMagicBytes("font/woff2", Buffer.from("wOF2")),
      {
        ok: true,
      },
    );
    const bad = validateAssetMagicBytes("image/png", Buffer.from("not-png"));
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.equal(bad.error.code, "signature_mismatch");
      assert.match(formatAssetUploadPolicyError(bad.error), /contents/);
    }
  });
});
