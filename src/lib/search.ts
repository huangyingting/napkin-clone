import type { Prisma } from "@/generated/prisma/client";

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
 * Returns `true` when the current runtime database provider is Postgres.
 * Mirrors the check in `src/lib/prisma.ts`.
 */
function isPostgresProvider(): boolean {
  return process.env.DB_PROVIDER === "postgres";
}

/**
 * Builds the `OR` array for a full-text search across document `title` and
 * `content` fields. The returned conditions are intended to be nested under an
 * `AND` clause so they compose with the existing access-scope `OR`.
 *
 * Provider behaviour:
 * - **SQLite** – `LIKE '%query%'`. SQLite's LIKE operator is case-insensitive
 *   for ASCII characters by default, which is acceptable for the SQLite CI path.
 * - **Postgres** – `ILIKE '%query%'` (case-insensitive). `mode: 'insensitive'`
 *   is added at runtime via a type cast because the SQLite-generated Prisma
 *   client types do not expose `mode` on `StringFilter`, while the Postgres
 *   schema does. The cast is safe: Prisma passes the field through to the DB
 *   driver unchanged, and the Postgres adapter honours `mode:'insensitive'`.
 *
 * @param query – pre-normalised, non-empty search string.
 */
export function buildSearchOr(query: string): Prisma.DocumentWhereInput[] {
  if (isPostgresProvider()) {
    // `mode: 'insensitive'` maps to ILIKE in Postgres. The cast is necessary
    // because the Prisma client is generated from the SQLite schema in CI,
    // where StringFilter does not include the `mode` field.
    const filter = {
      contains: query,
      mode: "insensitive",
    } as unknown as Prisma.StringFilter;
    return [{ title: filter }, { content: filter }];
  }

  // SQLite: `contains` maps to LIKE which is case-insensitive for ASCII.
  return [{ title: { contains: query } }, { content: { contains: query } }];
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
