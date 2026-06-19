/**
 * Shared validation helpers for the document import pipeline.
 *
 * All validation is pure (no I/O) so it can run in both the route handler
 * (server) and unit tests without any framework dependency.
 */

/** Maximum accepted upload size in bytes (20 MB). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Accepted file MIME types (canonical names used in HTTP Content-Type). */
export const ACCEPTED_MIME_TYPES = [
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "text/html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/pdf",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

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
 * the allowed limit. Returns the resolved MIME type on success.
 */
export function validateImportFile(
  mimeType: string,
  filename: string,
  byteSize: number,
): ValidationResult {
  if (byteSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: {
        code: "file_too_large",
        maxBytes: MAX_UPLOAD_BYTES,
        actualBytes: byteSize,
      },
    };
  }

  const mime = resolveImportMime(mimeType, filename);
  if (!mime) {
    return {
      ok: false,
      error: { code: "unsupported_type", accepted: ACCEPTED_MIME_TYPES },
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
      const maxMb = Math.round(error.maxBytes / (1024 * 1024));
      return `File is too large. Maximum allowed size is ${maxMb} MB.`;
    }
  }
}
