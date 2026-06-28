import type { AssetUploadPolicy } from "@/lib/assets/upload-policy";
import {
  SLIDE_ASSET_MAX_BYTES,
  SLIDE_ASSET_MAX_DIMENSION_PX,
  SLIDE_IMAGE_TYPES,
  type SlideImageMime,
} from "@/lib/limits";

/**
 * Canonical mapping from accepted slide-asset MIME types to their storage
 * file extension.
 */
export const SLIDE_MIME_TO_EXT: Record<string, string> = {
  /* Coverage rationale: MIME mapping literal is asserted by asset policy/storage tests; tsx maps object tail as uncovered. */
  /* node:coverage ignore next 4 */
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const SLIDE_ASSET_UPLOAD_POLICY: AssetUploadPolicy<SlideImageMime> = {
  storageRoot: "storage/slide-assets",
  urlPrefix: "/api/slide-assets",
  scopeIdKind: "documentId",
  acceptedMimeTypes: SLIDE_IMAGE_TYPES,
  mimeToExt: SLIDE_MIME_TO_EXT,
  maxBytes: SLIDE_ASSET_MAX_BYTES,
  dimensions: { maxPx: SLIDE_ASSET_MAX_DIMENSION_PX },
  extensionMimeMap: {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  },
};
