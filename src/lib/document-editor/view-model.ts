import { documentCapabilities } from "@/lib/auth/document-permissions";
import type { CommentThread } from "@/lib/comments";
import type { DocumentTag } from "@/lib/document/tags";

export interface DocumentEditorViewModel {
  documentId: string;
  initialTitle: string;
  initialStateJson: string | null;
  initialDeckJson: unknown;
  initialIsShared: boolean;
  initialShareId: string | null;
  initialSlug: string | null;
  initialShareExpiresAt: string | null;
  initialShareEmbedEnabled: boolean;
  initialSharePresentEnabled: boolean;
  initialShareMetadataMode: "generic" | "title" | "title-excerpt";
  initialShareDiscoverable: boolean;
  canEdit: boolean;
  canManage: boolean;
  workspaceName: string | null;
  userName: string;
  initialComments: CommentThread[];
  initialTags: DocumentTag[];
  allTags: DocumentTag[];
}

export interface DocumentEditorRow {
  id: string;
  title: string;
  contentJson: unknown;
  deckJson: unknown;
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
  shareMetadataMode: string;
  shareDiscoverable: boolean;
  ownerId: string;
  workspaceId: string | null;
  tags: DocumentTag[];
  workspace: {
    name: string;
    ownerId: string;
    members: { userId: string; role: string }[];
  } | null;
}

export function buildDocumentEditorViewModel({
  document,
  userId,
  userName,
  initialComments,
  allTags,
}: {
  document: DocumentEditorRow;
  userId: string;
  userName: string;
  initialComments: CommentThread[];
  allTags: DocumentTag[];
}): DocumentEditorViewModel {
  const { canEdit, canManage } = documentCapabilities(document, userId);

  return {
    documentId: document.id,
    initialTitle: document.title,
    initialStateJson: document.contentJson
      ? JSON.stringify(document.contentJson)
      : null,
    initialDeckJson: document.deckJson ?? null,
    initialIsShared: document.isShared,
    initialShareId: document.shareId,
    initialSlug: document.slug,
    initialShareExpiresAt: document.shareExpiresAt
      ? document.shareExpiresAt.toISOString()
      : null,
    initialShareEmbedEnabled: document.shareEmbedEnabled,
    initialSharePresentEnabled: document.sharePresentEnabled,
    initialShareMetadataMode:
      document.shareMetadataMode === "title" ||
      document.shareMetadataMode === "title-excerpt"
        ? document.shareMetadataMode
        : "generic",
    initialShareDiscoverable: document.shareDiscoverable,
    canEdit,
    canManage,
    workspaceName: document.workspace?.name ?? null,
    userName,
    initialComments,
    initialTags: document.tags,
    allTags,
  };
}
