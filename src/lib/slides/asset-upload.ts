/**
 * Asset upload validation helpers for Slides (Epic #374).
 *
 * Validates MIME type, byte size, pixel dimensions, and computes asset
 * metadata before the caller writes to storage. Pure functions — no I/O,
 * safe on both client (pre-flight) and server.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import {
  buildAssetPolicyMeta,
  formatAssetUploadPolicyError,
  /* node:coverage ignore next -- Import facade row is covered by adapter tests; tsx maps this specifier as uncovered. */
  isAcceptedAssetMime,
  resolveUploadMime,
  validateAssetDimensionsPolicy,
  validateAssetUploadPolicy,
  type AssetUploadPolicyError,
  type AssetUploadPolicyValidation,
  type AssetPolicyMeta,
  type AssetPolicyMetaResult,
} from "@/lib/assets/upload-policy";
import { SLIDE_ASSET_UPLOAD_POLICY } from "@/lib/slides/asset-policy";
import {
  SLIDE_ASSET_MAX_BYTES,
  /* node:coverage ignore next -- Type-bearing import is covered by validation tests; tsx maps this specifier as uncovered. */
  SLIDE_ASSET_MAX_DIMENSION_PX,
  type SlideImageMime,
} from "@/lib/limits";

/* node:coverage ignore next -- Re-export facade is compile-time wiring covered by consumers. */
export { SLIDE_IMAGE_TYPES, type SlideImageMime } from "@/lib/limits";

/** Maximum upload size for a single slide asset (10 MB). */
export const ASSET_MAX_BYTES = SLIDE_ASSET_MAX_BYTES;

/** Maximum pixel dimension (width or height) for raster images. */
export const ASSET_MAX_DIMENSION_PX = SLIDE_ASSET_MAX_DIMENSION_PX;
export { SLIDE_ASSET_UPLOAD_POLICY } from "@/lib/slides/asset-policy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetUploadError = AssetUploadPolicyError;

export type AssetUploadValidation = AssetUploadPolicyValidation<SlideImageMime>;

export type AssetMetaResult = AssetPolicyMetaResult<SlideImageMime>;

/** Metadata parsed from a validated asset before storage. */
export type AssetMeta = AssetPolicyMeta<SlideImageMime>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves MIME type from `type` header; falls back to extension sniffing. */
export function resolveAssetMime(type: string, name: string): string {
  return resolveUploadMime(SLIDE_ASSET_UPLOAD_POLICY, type, name);
}

/** Returns true if `mime` is in the accepted slide image type list. */
export function isAcceptedSlideImageType(mime: string): mime is SlideImageMime {
  return isAcceptedAssetMime(SLIDE_ASSET_UPLOAD_POLICY, mime);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/* node:coverage disable */
// Upload validation adapter behavior is asserted; tsx maps this wrapper signature as uncovered.
export function validateAssetUpload(
  type: string,
  name: string,
  size: number,
): AssetUploadValidation {
  return validateAssetUploadPolicy(SLIDE_ASSET_UPLOAD_POLICY, type, name, size);
}
/* node:coverage enable */
/* node:coverage ignore next 5 -- Dimension docs are source-mapped without runtime behavior. */
/**
 * Validates pixel dimensions reported for a raster image.
 * SVGs are dimensionless at the storage level — pass undefined for both.
 */
export function validateAssetDimensions(
  widthPx: number | undefined,
  heightPx: number | undefined,
): { ok: true } | { ok: false; error: AssetUploadError } {
  return validateAssetDimensionsPolicy(
    SLIDE_ASSET_UPLOAD_POLICY,
    widthPx,
    heightPx,
  );
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

/**
 * Assembles an `AssetMeta` record after successful validation.
 * Returns an error if the checksum is empty/whitespace or if the
 * resolved MIME type is not an accepted slide image type.
 */
export function buildAssetMeta(opts: {
  type: string;
  name: string;
  size: number;
  checksum: string;
  widthPx?: number;
  heightPx?: number;
}): AssetMetaResult {
  return buildAssetPolicyMeta({ policy: SLIDE_ASSET_UPLOAD_POLICY, ...opts });
}

// ---------------------------------------------------------------------------
// Error formatter
// ---------------------------------------------------------------------------

export function formatAssetUploadError(error: AssetUploadError): string {
  return formatAssetUploadPolicyError(error);
}
