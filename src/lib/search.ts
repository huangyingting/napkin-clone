import type { Prisma } from "@/generated/prisma/client";
import { caseInsensitiveContains } from "@/lib/db-provider";

/**
 * Maximum length of a user-supplied search query accepted by the server.
 * Longer strings are silently truncated before being used in a DB query.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * Maximum number of documents returned by a single `searchDocuments` call.
 * The query fires on every debounce tick and a one-character query can match
 * the entire corpus, so the result set is capped; the UI surfaces a "showing
 * first N" hint when the cap is hit so users know to narrow their search.
 */
export const SEARCH_RESULT_LIMIT = 100;

/**
 * Trims and length-clamps a raw search query string.
 * Returns an empty string when the input is blank so callers can short-circuit.
 */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
}

/**
 * Builds the `OR` array for a full-text search across document `title` and
 * `content` fields. The returned conditions are intended to be nested under an
 * `AND` clause so they compose with the existing access-scope `OR`.
 *
 * Case-sensitivity behaviour is encapsulated in `caseInsensitiveContains`
 * (see `src/lib/db-provider.ts`): Postgres uses `mode:'insensitive'` (ILIKE),
 * SQLite omits it (LIKE is already case-insensitive for ASCII).
 *
 * @param query – pre-normalised, non-empty search string.
 */
export function buildSearchOr(query: string): Prisma.DocumentWhereInput[] {
  const filter = caseInsensitiveContains(query);
  return [{ title: filter }, { content: filter }];
}

/**
 * Builds the complete `DocumentWhereInput` for a full-text search scoped to a
 * specific user's accessible documents. Combines the access-scope `OR` (owner
 * or workspace member) with the content-search `AND { OR [...] }` so that
 * Prisma generates a single efficient query.
 *
 * Callers are responsible for adding `deletedAt: null` to the outer where.
 *
 * @param query    – pre-normalised, non-empty search string.
 * @param accessOr – the result of `documentAccessOr(userId)`.
 */
export function buildDocumentSearchWhere(
  query: string,
  accessOr: NonNullable<Prisma.DocumentWhereInput["OR"]>,
): Prisma.DocumentWhereInput {
  return {
    deletedAt: null,
    OR: accessOr,
    AND: { OR: buildSearchOr(query) },
  };
}
