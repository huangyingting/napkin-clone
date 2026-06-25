/**
 * Shared validation helpers for the document import pipeline.
 *
 * All validation is pure (no I/O) so it can run in both the route handler
 * (server) and unit tests without any framework dependency.
 */

import {
  IMPORT_ACCEPTED_MIME_TYPES,
  IMPORT_MAX_BYTES_BY_MIME,
  IMPORT_MAX_UPLOAD_BYTES,
  formatImportFileTooLargeError,
  type ImportAcceptedMimeType,
} from "@/lib/limits";

export const MAX_UPLOAD_BYTES = IMPORT_MAX_UPLOAD_BYTES;
export const ACCEPTED_MIME_TYPES = IMPORT_ACCEPTED_MIME_TYPES;
export type AcceptedMimeType = ImportAcceptedMimeType;

/**
 * Per-type upload ceilings, in bytes (#96, criterion 3). Plain-text formats are
 * cheap to store but expensive to abuse with multi-megabyte payloads, so they
 * get a tighter limit than the binary office/PDF formats whose useful documents
 * are legitimately larger. Every value stays at or below {@link MAX_UPLOAD_BYTES}.
 */
const MAX_BYTES_BY_MIME = IMPORT_MAX_BYTES_BY_MIME;

/** Returns the per-type upload ceiling for a resolved MIME type. */
export function maxBytesForMime(mime: AcceptedMimeType): number {
  return MAX_BYTES_BY_MIME[mime];
}

/**
 * File extensions that map to a supported import format even when the browser
 * sends a generic MIME type (e.g. `application/octet-stream`).
 */
const EXT_TO_MIME: Record<string, AcceptedMimeType> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
};

/**
 * Resolves the effective MIME type for an uploaded file.
 *
 * Browsers sometimes report `application/octet-stream` for binary office
 * files. When that happens, we fall back to the file extension so the right
 * parser is chosen. Returns `null` when neither the MIME type nor the
 * extension map to a supported format.
 */
export function resolveImportMime(
  mimeType: string,
  filename: string,
): AcceptedMimeType | null {
  const lower = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ACCEPTED_MIME_TYPES.includes(lower as AcceptedMimeType)) {
    return lower as AcceptedMimeType;
  }

  // Fall back to extension.
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

export type ValidationError =
  | { code: "unsupported_type"; accepted: readonly string[] }
  | { code: "file_too_large"; maxBytes: number; actualBytes: number };

export type ValidationResult =
  | { ok: true; mime: AcceptedMimeType }
  | { ok: false; error: ValidationError };

/**
 * Validates that a file's MIME type is supported and its byte size is within
 * the per-type limit. Returns the resolved MIME type on success. The MIME type
 * is resolved first so the size limit applied is the one for the actual format
 * (#96, criterion 3).
 */
export function validateImportFile(
  mimeType: string,
  filename: string,
  byteSize: number,
): ValidationResult {
  const mime = resolveImportMime(mimeType, filename);
  if (!mime) {
    return {
      ok: false,
      error: { code: "unsupported_type", accepted: ACCEPTED_MIME_TYPES },
    };
  }

  const maxBytes = maxBytesForMime(mime);
  if (byteSize > maxBytes) {
    return {
      ok: false,
      error: {
        code: "file_too_large",
        maxBytes,
        actualBytes: byteSize,
      },
    };
  }

  return { ok: true, mime };
}

/**
 * Human-readable validation error message suitable for displaying in the UI.
 */
export function formatValidationError(error: ValidationError): string {
  switch (error.code) {
    case "unsupported_type":
      return "Unsupported file type. Please upload a .md, .html, .docx, .pptx, or .pdf file.";
    case "file_too_large": {
      return formatImportFileTooLargeError(error.maxBytes);
    }
  }
}
