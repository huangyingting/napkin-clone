export {
  normalizeAnchorType,
  normalizeAnchorText,
  validateAnchorGeometry,
  sanitizeAnchorGeometry,
  validateSlideId,
  validateElementId,
  slideAnchorFromRecord,
  slideAnchorToRecord,
  commentAnchorFromRecord,
  commentAnchorToRecord,
} from "./anchors";
export type {
  CommentAnchorType,
  AnchorPoint,
  DeckCommentAnchor,
  TextCommentAnchor,
  DocumentBlockCommentAnchor,
  SlideLevelCommentAnchor,
  SlideElementCommentAnchor,
  CommentAnchor,
  CommentAnchorRecord,
} from "./anchors";

export {
  applySlideDeleteToAnchors,
  applyElementDeleteToAnchors,
  findOrphanedAnchors,
} from "./lifecycle";

export { mapCommentThreadRecord } from "./mappers";
export type { CommentReplyRecord, CommentThreadRecord } from "./mappers";

export { canEditComment, canDeleteComment } from "./policy";
export type { CommentOwnership } from "./policy";

export { isCommentUnread } from "./read-state";
export type { UnreadCountScope } from "./read-state";

export { createCommentService } from "./service";
export type {
  CommentCapabilityContext,
  RequireCommentDocumentContext,
  CommentMutationResult,
  CommentService,
} from "./service";

export type {
  CommentAuthor,
  CommentNode,
  CommentThread,
  CreateCommentInput,
  ListCommentsOptions,
} from "./types";
