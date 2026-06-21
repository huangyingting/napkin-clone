/**
 * Pure helpers for free-form {@link ImageElement} sources.
 *
 * Kept DOM-free so they can be unit tested and shared by the canvas renderer
 * (empty-src placeholder), the inspector file picker (upload validation) and
 * the PPTX exporter (skip empty images) without dragging in React or the
 * browser File API.
 */

/**
 * True when an image element has no usable source. A bare `<img src="">` shows
 * a broken-image box and can re-request the current page, so every renderer
 * must branch on this instead of emitting an empty `src`.
 */
export function isEmptyImageSrc(src: string | null | undefined): boolean {
  return src == null || src.trim().length === 0;
}

/**
 * Upload size ceiling. Image uploads are inlined into `deckJson` as base64 data
 * URLs, which bloat the saved document (~33% larger than the raw bytes) and are
 * synced over the wire on every autosave. 5 MB keeps a single image well within
 * a reasonable deck budget while still allowing high-quality screenshots; the
 * tradeoff is that larger files are rejected rather than silently degrading
 * save performance.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageFileValidation = { ok: true } | { ok: false; reason: string };

/** The subset of {@link File} the validator needs (so it stays DOM-free). */
export interface ImageFileMeta {
  type: string;
  size: number;
}

/**
 * Validates a chosen file before it is read into a data URL: it must be an
 * image MIME type and must not exceed {@link MAX_IMAGE_UPLOAD_BYTES}.
 */
export function validateImageFile(
  file: ImageFileMeta,
  maxBytes: number = MAX_IMAGE_UPLOAD_BYTES,
): ImageFileValidation {
  if (!file.type.startsWith("image/")) {
    return { ok: false, reason: "Please choose an image file." };
  }
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, reason: `Image must be smaller than ${maxMb} MB.` };
  }
  return { ok: true };
}
