/**
 * Pure authorization helpers for comment mutations. These functions have no
 * I/O dependencies and can be unit-tested without a database or DOM.
 */

export type CommentOwnership = {
  authorId: string;
};

/**
 * Returns true when `userId` is the author of the comment and may edit it.
 */
export function canEditComment(
  userId: string,
  comment: CommentOwnership,
): boolean {
  return userId === comment.authorId;
}

/**
 * Returns true when `userId` is the author of the comment and may delete it.
 */
export function canDeleteComment(
  userId: string,
  comment: CommentOwnership,
): boolean {
  return userId === comment.authorId;
}
