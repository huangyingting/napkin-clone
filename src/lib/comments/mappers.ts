import {
  commentAnchorFromRecord,
  legacySlideAnchorFromAnchor,
  normalizeAnchorType,
  type CommentAnchorRecord,
} from "./anchors";
import type { CommentNode, CommentThread } from "./types";

type AuthorRecord = { id: string; name: string | null; email: string };

export type CommentReplyRecord = {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRecord;
};

export type CommentThreadRecord = CommentAnchorRecord & {
  id: string;
  body: string;
  resolved: boolean;
  createdAt: Date;
  author: AuthorRecord;
  replies: CommentReplyRecord[];
};

function displayName(author: AuthorRecord): string {
  return author.name ?? author.email ?? "Unknown";
}

function mapCommentNode(record: CommentReplyRecord): CommentNode {
  return {
    id: record.id,
    body: record.body,
    createdAt: record.createdAt.toISOString(),
    author: { id: record.author.id, name: displayName(record.author) },
  };
}

export function mapCommentThreadRecord(
  record: CommentThreadRecord,
): CommentThread {
  const anchor = commentAnchorFromRecord(record);
  return {
    id: record.id,
    body: record.body,
    resolved: record.resolved,
    anchor,
    anchorType: normalizeAnchorType(record.anchorType ?? null),
    anchorText: record.anchorText ?? null,
    anchorNodeId: record.anchorNodeId ?? null,
    slideAnchor: legacySlideAnchorFromAnchor(anchor),
    createdAt: record.createdAt.toISOString(),
    author: { id: record.author.id, name: displayName(record.author) },
    replies: record.replies.map(mapCommentNode),
  };
}
