/**
 * Asset upload validation helpers for Brand Studio (US-007).
 *
 * Font and logo uploads are validated server-side before storage.
 * These pure helpers work identically on both client (pre-flight) and server.
 */

import {
  formatAssetUploadPolicyError,
  validateAssetUploadPolicy,
  type AssetUploadPolicyError,
} from "@/lib/assets/upload-policy";
import {
  BRAND_FONT_UPLOAD_POLICY,
  BRAND_LOGO_UPLOAD_POLICY,
} from "@/lib/brand/asset-policy";
import { BRAND_FONT_MAX_BYTES, BRAND_LOGO_MAX_BYTES } from "@/lib/limits";

export const FONT_MAX_BYTES = BRAND_FONT_MAX_BYTES;
export const LOGO_MAX_BYTES = BRAND_LOGO_MAX_BYTES;
export {
  BRAND_FONT_UPLOAD_POLICY,
  BRAND_LOGO_UPLOAD_POLICY,
} from "@/lib/brand/asset-policy";

export type UploadError = Exclude<
  AssetUploadPolicyError,
  { code: "dimension_exceeded" } | { code: "checksum_missing" }
>;

export type UploadValidation =
  | { ok: true; mime: string; byteSize: number }
  | { ok: false; error: UploadError };

export function validateFontUpload(
  type: string,
  name: string,
  size: number,
): UploadValidation {
  return validateAssetUploadPolicy(
    BRAND_FONT_UPLOAD_POLICY,
    type,
    name,
    size,
  ) as UploadValidation;
}

export function validateLogoUpload(
  type: string,
  name: string,
  size: number,
): UploadValidation {
  return validateAssetUploadPolicy(
    BRAND_LOGO_UPLOAD_POLICY,
    type,
    name,
    size,
  ) as UploadValidation;
}

export function formatUploadError(error: UploadError): string {
  return formatAssetUploadPolicyError(error);
}
