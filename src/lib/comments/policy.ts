export type CommentOwnership = {
  authorId: string;
};

export function canEditComment(
  userId: string,
  comment: CommentOwnership,
): boolean {
  return userId === comment.authorId;
}

export function canDeleteComment(
  userId: string,
  comment: CommentOwnership,
): boolean {
  return userId === comment.authorId;
}
