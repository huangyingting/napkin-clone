import type { Prisma } from "@/generated/prisma/client";

/**
 * Default cap on the number of documents returned by unbounded list queries
 * (the dashboard's personal/workspace lists and a workspace's document list).
 * Keeps page loads and serialization bounded for accounts/workspaces with many
 * documents instead of selecting every row.
 */
export const DOCUMENT_LIST_LIMIT = 200;

/** A list capped to a limit, plus whether more rows existed beyond the cap. */
export type CappedList<T> = { items: T[]; hasMore: boolean };

/**
 * Shapes rows fetched with the "request one extra" pattern (`take: limit + 1`)
 * into a capped result. Returns at most `limit` items and sets `hasMore` when
 * the query returned more rows than the cap (i.e. additional matches exist).
 *
 * Pure and DOM-free so it can be unit-tested directly.
 *
 * @param rows  – rows returned by a query that requested `limit + 1`.
 * @param limit – the desired cap; non-positive or non-finite values clamp to 0.
 */
export function capList<T>(rows: T[], limit: number): CappedList<T> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (rows.length > safeLimit) {
    return { items: rows.slice(0, safeLimit), hasMore: true };
  }
  return { items: rows, hasMore: false };
}

/**
 * The `where.OR` granting a user *view* access to a document: they own it OR are
 * a member (any role) of its workspace. Used by read-only listing/search scopes.
 *
 * Role-aware mutation authorization (view/edit/manage) is centralized in
 * `@/lib/auth/document-permissions` — use `requireDocumentCapability` there for
 * any document mutation rather than scoping writes with this OR.
 */
export function documentAccessOr(
  userId: string,
): NonNullable<Prisma.DocumentWhereInput["OR"]> {
  return [
    { ownerId: userId },
    {
      workspaceId: { not: null },
      workspace: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
  ];
}
