"use client";

/**
 * Shared file-to-data-URL upload flow for image elements and slide backgrounds.
 *
 * Encapsulates the validate → FileReader → budget-check pipeline that was
 * previously duplicated in `ImageElementEditor.handleFile` (inspector). Three
 * call sites use this hook:
 *  1. `ImageElementEditor` in `slide-inspector.tsx` (element image upload)
 *  2. The Insert ▸ Image path in `slide-editor.tsx` (pre-populated insert)
 *  3. The Style-tab background upload button in `slide-inspector.tsx`
 *
 * When `documentId` and `uploadFn` are both provided the hook first attempts a
 * server-side upload (Epic #374).  On success `onAccept` is called with the
 * served URL and the new `assetId`; if the upload fails the hook transparently
 * falls back to the local data-URL path so the editor keeps working offline.
 *
 * The pure gatekeepers `validateImageFile` and `canAddImage` are NOT weakened —
 * they remain the only guard for type, size, and budget (issues #226, #302, #303).
 */

import { useCallback } from "react";

import type { ActionResult } from "@/lib/action-result";
import type { Deck } from "./deck";
import {
  canAddImage,
  dataUrlByteSize,
  validateImageFile,
} from "./image-element";

export type UploadSlideAssetFn = (
  documentId: string,
  formData: FormData,
) => Promise<ActionResult<{ assetId: string; url: string }>>;

export interface UseImageUploadOptions {
  /** The whole deck — used only for the total inlined-image budget check. */
  deck: Deck;
  /**
   * Called with the resulting source (data URL or served URL) when the file
   * passes all checks.  `assetId` is set when the server upload succeeded.
   */
  onAccept: (src: string, assetId?: string) => void;
  /** Called with a human-readable message when validation or budget fails. */
  onError: (message: string) => void;
  /**
   * The data URL of the image being replaced. Defaults to `""` (a fresh
   * insert). Used to compute the net change in inlined bytes so a
   * like-for-like swap is never falsely rejected by the budget check.
   */
  currentSrc?: string;
  /**
   * When provided together with `uploadFn`, the hook attempts a server-side
   * upload before falling back to the data-URL path (Epic #374).
   */
  documentId?: string;
  /**
   * Server action for the server-upload path.  Injected so call sites can
   * supply the real action and tests can supply a mock without coupling the
   * hook to a specific import path.
   */
  uploadFn?: UploadSlideAssetFn;
}

export function useImageUpload({
  deck,
  onAccept,
  onError,
  currentSrc = "",
  documentId,
  uploadFn,
}: UseImageUploadOptions) {
  /** Reads `file` into a data URL and performs the inlined-budget check. */
  function readAsDataUrl(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      // Net change: a replacement only costs the difference in bytes.
      const addedBytes = dataUrlByteSize(result) - dataUrlByteSize(currentSrc);
      const budget = canAddImage(deck, addedBytes);
      if (addedBytes > 0 && !budget.ok) {
        const usedMb = (budget.totalBytes / (1024 * 1024)).toFixed(1);
        onError(
          `Deck image storage is full (${usedMb} MB). Remove an image or use a smaller file.`,
        );
        return;
      }
      onAccept(result);
    };
    reader.onerror = () => onError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  const handleFile = useCallback(
    (file: File | undefined): void => {
      if (!file) return;
      const validation = validateImageFile(file);
      if (!validation.ok) {
        onError(validation.reason);
        return;
      }

      // Server-upload path: attempt when documentId + uploadFn are provided.
      if (documentId && uploadFn) {
        const formData = new FormData();
        formData.append("file", file);
        uploadFn(documentId, formData).then(
          (result) => {
            if (result.ok) {
              onAccept(result.data.url, result.data.assetId);
            } else {
              // Server upload failed — fall back to the data-URL path silently.
              readAsDataUrl(file);
            }
          },
          () => {
            // Network / unexpected error — fall back to data-URL path.
            readAsDataUrl(file);
          },
        );
        return;
      }

      readAsDataUrl(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck, onAccept, onError, currentSrc, documentId, uploadFn],
  );

  return { handleFile };
}
