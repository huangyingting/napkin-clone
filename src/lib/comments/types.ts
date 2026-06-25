import type { CommentAnchor, CommentAnchorType } from "./anchors";

export type CommentAuthor = {
  id: string;
  name: string;
};

export type CommentNode = {
  id: string;
  body: string;
  author: CommentAuthor;
  createdAt: string;
};

export type CommentThread = CommentNode & {
  resolved: boolean;
  anchor: CommentAnchor;
  anchorType: CommentAnchorType | null;
  anchorText: string | null;
  anchorNodeId: string | null;
  replies: CommentNode[];
};

export type CreateCommentInput = {
  body: string;
  parentId?: string | null;
  anchorType?: CommentAnchorType | null;
  anchorText?: string | null;
  anchorNodeId?: string | null;
  slideId?: string | null;
  elementId?: string | null;
  anchorGeometry?: { x: unknown; y: unknown } | null;
};

export type ListCommentsOptions = {
  slideId?: string | null;
  anchorScope?: "all" | "text" | "slide";
};
