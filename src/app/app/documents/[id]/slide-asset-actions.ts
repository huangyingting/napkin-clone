"use server";

/**
 * Slide asset upload server action (Epic #374).
 *
 * Validates the uploaded image, computes a SHA-256 checksum for dedup,
 * stores the bytes via the configured {@link AssetStorageAdapter}, and
 * upserts an {@link Asset} row in the database.  Returns `{assetId, url}` on
 * success so the caller can persist `assetId` on the {@link ImageElement} and
 * use the URL as `src`.
 */

import { createHash } from "node:crypto";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  buildAssetMeta,
  formatAssetUploadError,
  validateAssetUpload,
} from "@/lib/slides/asset-upload";
import {
  deriveStorageKey,
  getDefaultStorageAdapter,
} from "@/lib/slides/asset-storage";
import { withP2002Fallback } from "@/lib/slides/p2002-fallback";

export type UploadSlideAssetResult = { assetId: string; url: string };

/**
 * Uploads a slide image asset for the given document.
 *
 * Steps:
 *  1. Auth — user must have `edit` capability on the document.
 *  2. Validation — MIME type and byte-size via {@link validateAssetUpload}.
 *  3. Checksum — SHA-256 of the raw bytes.
 *  4. Dedup — if an Asset row with the same `documentId` + `checksum` already
 *     exists the existing record is returned (no duplicate write).
 *  5. Storage — raw bytes written via {@link getDefaultStorageAdapter}.
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
  const user = await requireUser();

  // Auth: the acting user must be able to edit the document.
  await requireDocumentCapability(user.id, documentId, "edit");

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

  // Read raw bytes and compute SHA-256 checksum.
  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  // Dedup: return the existing asset if this document already has the same file.
  const existing = await prisma.asset.findFirst({
    where: { documentId, checksum },
    select: { id: true, storageKey: true },
  });
  if (existing) {
    const url = getDefaultStorageAdapter().urlFor(existing.storageKey);
    return actionOk({ assetId: existing.id, url });
  }

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
  const { meta } = metaResult;

  // Extension is derived from the validated MIME type — never from the filename.
  const storageKey = deriveStorageKey(documentId, checksum, meta.mimeType);

  // Persist bytes.
  const url = await getDefaultStorageAdapter().store(
    storageKey,
    buffer,
    meta.mimeType,
  );

  // Create Asset record, recovering from concurrent-insert P2002 races.
  const asset = await withP2002Fallback<{ id: string }>(
    () =>
      prisma.asset.create({
        data: {
          documentId,
          mimeType: meta.mimeType,
          byteSize: meta.byteSize,
          checksum,
          storageKey,
          ...(meta.originalName ? { originalName: meta.originalName } : {}),
        },
        select: { id: true },
      }),
    () =>
      prisma.asset.findFirst({
        where: { documentId, checksum },
        select: { id: true },
      }),
  );

  return actionOk({ assetId: asset.id, url });
}
