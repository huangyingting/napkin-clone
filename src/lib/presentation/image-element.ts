/**
 * Pure helpers for free-form {@link ImageElement} sources.
 *
 * Kept DOM-free so they can be unit tested and shared by the canvas renderer
 * (empty-src placeholder), the inspector file picker (upload validation) and
 * the PPTX exporter (skip empty images) without dragging in React or the
 * browser File API.
 */

import type { Deck } from "./deck";

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

/**
 * Total inlined-image budget for a single deck. Uploaded images are stored as
 * base64 data URLs inside `deckJson`, which is re-serialized and POSTed in full
 * on every autosave (issue #247). The per-image {@link MAX_IMAGE_UPLOAD_BYTES}
 * cap bounds one file, but a deck with several images can still grow to tens of
 * megabytes, making each debounced save a multi-MB write. This total cap keeps
 * the whole deck's inlined-image payload bounded so autosave stays cheap.
 *
 * 12 MB allows roughly a handful of large screenshots while staying well under
 * typical request-body limits. It is intentionally measured against the size of
 * the data-URL strings actually stored in `deckJson` (the thing that gets
 * serialized and sent), not the decoded pixel data. A future option is to
 * offload images to blob storage and reference them by URL instead of inlining.
 */
export const TOTAL_IMAGE_BUDGET_BYTES = 12 * 1024 * 1024;

/**
 * Estimates how many bytes a source string contributes to `deckJson`.
 *
 * Only inlined `data:` URLs are counted — those are the payload that bloats the
 * saved document. External `http(s)`/relative URLs and empty sources cost ~0
 * because only their short reference string is stored, so they return 0. Data
 * URLs are ASCII, so the string length is an accurate byte count of what is
 * serialized into `deckJson`.
 */
export function dataUrlByteSize(src: string | null | undefined): number {
  if (src == null) {
    return 0;
  }
  if (!src.startsWith("data:")) {
    return 0;
  }
  return src.length;
}

/**
 * Sums the inlined-image bytes across every {@link ImageElement} in the deck —
 * i.e. the total data-URL payload currently stored in `deckJson`. Non-image
 * elements and image elements whose `src` is an external URL contribute 0.
 */
export function totalInlineImageBytes(deck: Deck): number {
  let total = 0;
  for (const slide of deck.slides) {
    for (const element of slide.elements ?? []) {
      if (element.kind === "image") {
        total += dataUrlByteSize(element.src);
      }
    }
  }
  return total;
}

/** Result of a {@link canAddImage} budget check. */
export interface ImageBudgetCheck {
  /** True when the new image fits within `budget`. */
  ok: boolean;
  /** Projected total inlined-image bytes after adding `newBytes`. */
  totalBytes: number;
  /** The budget the check was made against. */
  budget: number;
}

/**
 * Predicate for the inspector upload path: can `newBytes` of new inlined image
 * data be added to `deck` without exceeding `budget`? Returns the projected
 * total so callers can surface it in an error message.
 *
 * `newBytes` is the *net* change in inlined bytes (a fresh upload passes its
 * full size; a replacement passes `newSize - oldSize`), so swapping one image
 * for another of similar size is not falsely rejected. Pure and DOM-free.
 */
export function canAddImage(
  deck: Deck,
  newBytes: number,
  budget: number = TOTAL_IMAGE_BUDGET_BYTES,
): ImageBudgetCheck {
  const totalBytes = totalInlineImageBytes(deck) + newBytes;
  return { ok: totalBytes <= budget, totalBytes, budget };
}
