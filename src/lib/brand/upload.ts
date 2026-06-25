/**
 * Asset upload validation helpers for Brand Studio (US-007).
 *
 * Font and logo uploads are validated server-side before storage.
 * These pure helpers work identically on both client (pre-flight) and server.
 */

import {
  BRAND_FONT_ACCEPTED_TYPES,
  BRAND_FONT_MAX_BYTES,
  BRAND_LOGO_ACCEPTED_TYPES,
  BRAND_LOGO_MAX_BYTES,
  formatAssetFileTooLargeError,
} from "@/lib/limits";

const FONT_ACCEPTED_TYPES = BRAND_FONT_ACCEPTED_TYPES;
const LOGO_ACCEPTED_TYPES = BRAND_LOGO_ACCEPTED_TYPES;

export const FONT_MAX_BYTES = BRAND_FONT_MAX_BYTES;
export const LOGO_MAX_BYTES = BRAND_LOGO_MAX_BYTES;

export type UploadError =
  | { code: "type_rejected"; accepted: readonly string[] }
  | { code: "file_too_large"; maxBytes: number };

export type UploadValidation =
  | { ok: true; mime: string }
  | { ok: false; error: UploadError };

/** Derives a safe MIME type from type + filename extension. */
function resolveType(type: string, name: string): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  };
  return map[ext] ?? type;
}

export function validateFontUpload(
  type: string,
  name: string,
  size: number,
): UploadValidation {
  if (size > FONT_MAX_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", maxBytes: FONT_MAX_BYTES },
    };
  }
  const resolved = resolveType(type, name);
  if (!(FONT_ACCEPTED_TYPES as readonly string[]).includes(resolved)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: FONT_ACCEPTED_TYPES },
    };
  }
  return { ok: true, mime: resolved };
}

export function validateLogoUpload(
  type: string,
  name: string,
  size: number,
): UploadValidation {
  if (size > LOGO_MAX_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", maxBytes: LOGO_MAX_BYTES },
    };
  }
  const resolved = resolveType(type, name);
  if (!(LOGO_ACCEPTED_TYPES as readonly string[]).includes(resolved)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: LOGO_ACCEPTED_TYPES },
    };
  }
  return { ok: true, mime: resolved };
}

export function formatUploadError(error: UploadError): string {
  if (error.code === "file_too_large") {
    return formatAssetFileTooLargeError(error.maxBytes);
  }
  return `Unsupported file type. Accepted: ${error.accepted.join(", ")}.`;
}
