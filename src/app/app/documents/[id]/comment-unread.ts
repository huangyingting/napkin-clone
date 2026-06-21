/**
 * Pure, I/O-free helpers for the in-app comment unread indicator (issue #160).
 *
 * The unread signal for a user on a document is the number of comments created
 * after the user last opened the comments panel (`lastReadAt`), excluding the
 * user's own comments — you are never "unread" on something you wrote. When the
 * user has never opened the panel (`lastReadAt` is null) every other person's
 * comment counts as unread. These functions take plain data so they can be
 * unit-tested without a database or DOM.
 */

/** Minimal shape needed to decide whether a comment is unread for a user. */
export type UnreadComment = {
  /** When the comment was created (Date or ISO string). */
  createdAt: Date | string;
  /** The id of the user who authored the comment. */
  authorId: string;
};

export type UnreadInput = {
  /** All comments on the document (top-level and replies). */
  comments: UnreadComment[];
  /** When the user last read the thread, or null if never. */
  lastReadAt: Date | string | null;
  /** The id of the user the count is computed for. */
  currentUserId: string;
};

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Counts comments that are unread for `currentUserId`: created strictly after
 * `lastReadAt` (or any time, when `lastReadAt` is null) and authored by someone
 * else. Returns 0 when there are no qualifying comments.
 */
export function unreadCommentCount({
  comments,
  lastReadAt,
  currentUserId,
}: UnreadInput): number {
  const threshold = lastReadAt === null ? null : toMillis(lastReadAt);

  let count = 0;
  for (const comment of comments) {
    if (comment.authorId === currentUserId) {
      continue;
    }
    if (threshold === null || toMillis(comment.createdAt) > threshold) {
      count += 1;
    }
  }
  return count;
}

/**
 * Convenience predicate: true when `currentUserId` has at least one unread
 * comment on the document.
 */
export function hasUnreadComments(input: UnreadInput): boolean {
  return unreadCommentCount(input) > 0;
}
