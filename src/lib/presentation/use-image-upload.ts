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
 * The pure gatekeepers `validateImageFile` and `canAddImage` are NOT weakened —
 * they remain the only guard for type, size, and budget (issues #226, #302, #303).
 */

import { useCallback } from "react";

import type { Deck } from "./deck";
import {
  canAddImage,
  dataUrlByteSize,
  validateImageFile,
} from "./image-element";

export interface UseImageUploadOptions {
  /** The whole deck — used only for the total inlined-image budget check. */
  deck: Deck;
  /** Called with the resulting data URL when the file passes all checks. */
  onAccept: (dataUrl: string) => void;
  /** Called with a human-readable message when validation or budget fails. */
  onError: (message: string) => void;
  /**
   * The data URL of the image being replaced. Defaults to `""` (a fresh
   * insert). Used to compute the net change in inlined bytes so a
   * like-for-like swap is never falsely rejected by the budget check.
   */
  currentSrc?: string;
}

export function useImageUpload({
  deck,
  onAccept,
  onError,
  currentSrc = "",
}: UseImageUploadOptions) {
  const handleFile = useCallback(
    (file: File | undefined): void => {
      if (!file) return;
      const validation = validateImageFile(file);
      if (!validation.ok) {
        onError(validation.reason);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") return;
        // Net change: a replacement only costs the difference in bytes.
        const addedBytes =
          dataUrlByteSize(result) - dataUrlByteSize(currentSrc);
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
    },
    [deck, onAccept, onError, currentSrc],
  );

  return { handleFile };
}
