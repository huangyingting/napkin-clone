import type { ActionResult } from "@/lib/action-result";
import type { BrandStyle } from "@/lib/brand/schema";
import type {
  CommentThread,
  CreateCommentInput,
  ListCommentsOptions,
} from "@/lib/comments";
import type {
  SaveDeckPatchResult,
  SaveDeckResult,
} from "@/lib/document/persistence-types";
import type { SearchResults } from "@/lib/document-management/list";
import type { Deck } from "@/lib/presentation/deck";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import type { Visual } from "@/lib/visual/schema";

export interface DeckFetchPort {
  fetchDeckJson: (
    documentId: string,
  ) => Promise<{ deckJson: unknown; revisionToken: string | null }>;
}

export interface DeckSavePort {
  saveDeckJson: (
    documentId: string,
    deckJson: unknown,
    clientToken?: string | null,
  ) => Promise<SaveDeckResult>;
  saveDeckPatch: (
    documentId: string,
    patches: DeckPatch[],
    clientToken: string | null | undefined,
  ) => Promise<SaveDeckPatchResult>;
}

export type DeckActionPort = DeckFetchPort & DeckSavePort;

export interface BrandListPort {
  listBrands: () => Promise<BrandStyle[]>;
}

export interface BrandApplyPort {
  applyBrand: (visual: Visual, brand: BrandStyle) => Visual;
  applyBrandToDeck?: (deck: Deck, brand: BrandStyle) => Deck;
}

export type BrandActionPort = BrandListPort & Partial<BrandApplyPort>;

export interface UploadSlideAssetResult {
  assetId: string;
  url: string;
}

export type UploadSlideAssetPort = (
  documentId: string,
  formData: FormData,
) => Promise<ActionResult<UploadSlideAssetResult>>;

export interface SlideAssetActionPort {
  uploadSlideAsset: UploadSlideAssetPort;
}

export interface DocumentListActionPort {
  searchDocuments: (query: string) => Promise<SearchResults>;
  renameDocument: (
    documentId: string,
    rawTitle: string,
  ) => Promise<{ title: string }>;
  duplicateDocument: (documentId: string) => Promise<void>;
  toggleFavorite: (documentId: string) => Promise<{ favorite: boolean }>;
  deleteDocument: (documentId: string) => Promise<void>;
  restoreDocument: (documentId: string) => Promise<void>;
}

export interface CommentsActionPort {
  listComments: (
    documentId: string,
    options?: ListCommentsOptions,
  ) => Promise<CommentThread[]>;
  createComment: (
    documentId: string,
    input: CreateCommentInput,
  ) => Promise<CommentThread[]>;
  editComment: (commentId: string, newBody: string) => Promise<CommentThread[]>;
  deleteComment: (commentId: string) => Promise<CommentThread[]>;
  setCommentResolved: (
    commentId: string,
    resolved: boolean,
  ) => Promise<CommentThread[]>;
}
