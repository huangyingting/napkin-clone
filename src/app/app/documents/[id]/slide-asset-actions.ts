"use server";

/**
 * Slide asset upload server action (Epic #374).
 *
 * Validates the uploaded image and stores it through the slide asset adapter.
 * Returns `{assetId, url}` on success so the caller can persist `assetId` on
 * the {@link ImageElement} and use the URL as `src`.
 */

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import type { UploadSlideAssetResult } from "@/lib/action-ports";
import { requireDocumentActionContext } from "@/lib/actions/document-action-context";
import { calculateAssetChecksum } from "@/lib/assets/store";
import {
  imageDimensionsFromBytes,
  validateAssetDimensionsPolicy,
  validateAssetMagicBytes,
} from "@/lib/assets/upload-policy";
import {
  buildAssetMeta,
  formatAssetUploadError,
  validateAssetUpload,
  SLIDE_ASSET_UPLOAD_POLICY,
} from "@/lib/slides/asset-upload";
import { storeSlideAsset } from "@/lib/slides/asset-store";

/**
 * Uploads a slide image asset for the given document.
 *
 * Steps:
 *  1. Auth — user must have `edit` capability on the document.
 *  2. Validation — MIME type and byte-size via {@link validateAssetUpload}.
 *  3. Checksum — SHA-256 of the raw bytes.
 *  4. Dedup — if an Asset row with the same `documentId` + `checksum` already
 *     exists the existing record is returned (no duplicate write).
 *  5. Storage — raw bytes written via the configured slide storage adapter.
 *  6. DB row — an `Asset` record is created (with P2002 race recovery) and
 *     its `id` returned.
 *
 * @param documentId - The owning document's id; scopes the asset and enforces auth.
 * @param formData   - Must contain a `file` entry of type {@link File}.
 */
export async function uploadSlideAsset(
  documentId: string,
  formData: FormData,
): Promise<ActionResult<UploadSlideAssetResult>> {
  await requireDocumentActionContext(documentId, "edit");

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return actionError("No file provided.");
  }

  // Validate MIME type and byte size.
  const validation = validateAssetUpload(
    fileEntry.type,
    fileEntry.name,
    fileEntry.size,
  );
  if (!validation.ok) {
    return actionError(formatAssetUploadError(validation.error));
  }

  // Read raw bytes and compute shared SHA-256 checksum.
  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const magic = validateAssetMagicBytes(validation.mime, buffer);
  if (!magic.ok) {
    return actionError(formatAssetUploadError(magic.error));
  }
  const dimensions = imageDimensionsFromBytes(validation.mime, buffer);
  const dimensionValidation = validateAssetDimensionsPolicy(
    SLIDE_ASSET_UPLOAD_POLICY,
    dimensions.widthPx,
    dimensions.heightPx,
  );
  if (!dimensionValidation.ok) {
    return actionError(formatAssetUploadError(dimensionValidation.error));
  }
  const checksum = calculateAssetChecksum(buffer);

  // Build full metadata (resolves MIME, validates again with name/ext).
  const metaResult = buildAssetMeta({
    type: fileEntry.type,
    name: fileEntry.name,
    size: fileEntry.size,
    checksum,
  });
  if (!metaResult.ok) {
    return actionError(formatAssetUploadError(metaResult.error));
  }
  const stored = await storeSlideAsset({
    documentId,
    buffer,
    meta: metaResult.meta,
  });

  return actionOk({ assetId: stored.assetId, url: stored.url });
}
