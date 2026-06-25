export type UnreadCountScope = "all" | "text" | "slide";

export function isCommentUnread(
  comment: { createdAt: Date; authorId: string },
  userId: string,
  lastReadAt: Date | null,
): boolean {
  if (comment.authorId === userId) {
    return false;
  }
  if (lastReadAt === null) {
    return true;
  }
  return comment.createdAt > lastReadAt;
}
