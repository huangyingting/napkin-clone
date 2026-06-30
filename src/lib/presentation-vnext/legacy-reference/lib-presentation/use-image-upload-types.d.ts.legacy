import type { ActionResult } from "@/lib/action-result";
import type { Deck } from "./deck-core";

export type UploadSlideAssetFn = (
  documentId: string,
  formData: FormData,
) => Promise<ActionResult<{ assetId: string; url: string }>>;

export type UseImageUploadOptions = {
  deck: Deck;
  onAccept: (src: string, assetId?: string) => void;
  onError: (message: string) => void;
  currentSrc?: string;
  documentId?: string;
  uploadFn?: UploadSlideAssetFn;
};
