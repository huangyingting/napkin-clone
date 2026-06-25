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
  SLIDE_ASSET_MAX_BYTES,
  SLIDE_ASSET_MAX_DIMENSION_PX,
  SLIDE_IMAGE_TYPES,
  formatAssetFileTooLargeError,
  type SlideImageMime,
} from "@/lib/limits";

export { SLIDE_IMAGE_TYPES, type SlideImageMime } from "@/lib/limits";

/** Maximum upload size for a single slide asset (10 MB). */
export const ASSET_MAX_BYTES = SLIDE_ASSET_MAX_BYTES;

/** Maximum pixel dimension (width or height) for raster images. */
export const ASSET_MAX_DIMENSION_PX = SLIDE_ASSET_MAX_DIMENSION_PX;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetUploadError =
  | { code: "type_rejected"; accepted: readonly string[] }
  | { code: "file_too_large"; maxBytes: number }
  | { code: "dimension_exceeded"; maxPx: number }
  | { code: "checksum_missing" };

export type AssetUploadValidation =
  | { ok: true; mime: SlideImageMime; byteSize: number }
  | { ok: false; error: AssetUploadError };

export type AssetMetaResult =
  | { ok: true; meta: AssetMeta }
  | { ok: false; error: AssetUploadError };

/** Metadata parsed from a validated asset before storage. */
export interface AssetMeta {
  mimeType: SlideImageMime;
  byteSize: number;
  checksum: string;
  widthPx?: number;
  heightPx?: number;
  originalName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves MIME type from `type` header; falls back to extension sniffing. */
export function resolveAssetMime(type: string, name: string): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  return extMap[ext] ?? type;
}

/** Returns true if `mime` is in the accepted slide image type list. */
export function isAcceptedSlideImageType(mime: string): mime is SlideImageMime {
  return (SLIDE_IMAGE_TYPES as readonly string[]).includes(mime);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a slide image upload by MIME type and byte size.
 *
 * @param type   - MIME type reported by the client (may be empty string).
 * @param name   - Original filename; used for extension-based fallback.
 * @param size   - File size in bytes.
 */
export function validateAssetUpload(
  type: string,
  name: string,
  size: number,
): AssetUploadValidation {
  if (size > ASSET_MAX_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", maxBytes: ASSET_MAX_BYTES },
    };
  }
  const mime = resolveAssetMime(type, name);
  if (!isAcceptedSlideImageType(mime)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: SLIDE_IMAGE_TYPES },
    };
  }
  return { ok: true, mime, byteSize: size };
}

/**
 * Validates pixel dimensions reported for a raster image.
 * SVGs are dimensionless at the storage level — pass undefined for both.
 */
export function validateAssetDimensions(
  widthPx: number | undefined,
  heightPx: number | undefined,
): { ok: true } | { ok: false; error: AssetUploadError } {
  const max = Math.max(widthPx ?? 0, heightPx ?? 0);
  if (max > ASSET_MAX_DIMENSION_PX) {
    return {
      ok: false,
      error: { code: "dimension_exceeded", maxPx: ASSET_MAX_DIMENSION_PX },
    };
  }
  return { ok: true };
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
  if (!opts.checksum || !opts.checksum.trim()) {
    return { ok: false, error: { code: "checksum_missing" } };
  }
  const resolved = resolveAssetMime(opts.type, opts.name);
  if (!isAcceptedSlideImageType(resolved)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: SLIDE_IMAGE_TYPES },
    };
  }
  return {
    ok: true,
    meta: {
      mimeType: resolved,
      byteSize: opts.size,
      checksum: opts.checksum,
      ...(opts.widthPx !== undefined ? { widthPx: opts.widthPx } : {}),
      ...(opts.heightPx !== undefined ? { heightPx: opts.heightPx } : {}),
      originalName: opts.name || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Error formatter
// ---------------------------------------------------------------------------

export function formatAssetUploadError(error: AssetUploadError): string {
  switch (error.code) {
    case "file_too_large": {
      return formatAssetFileTooLargeError(error.maxBytes);
    }
    case "type_rejected":
      return `Unsupported file type. Accepted: ${error.accepted.join(", ")}.`;
    case "dimension_exceeded":
      return `Image dimensions exceed the ${error.maxPx}px limit.`;
    case "checksum_missing":
      return "File integrity check failed — checksum is required.";
  }
}
