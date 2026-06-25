import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAssetPolicyMeta,
  formatAssetUploadPolicyError,
  validateAssetDimensionsPolicy,
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
});
