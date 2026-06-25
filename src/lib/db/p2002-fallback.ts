/**
 * Generic helper for handling Prisma P2002 unique-constraint races.
 *
 * When two requests create the same uniquely constrained row simultaneously,
 * both may pass a pre-flight lookup and then race to `create`. The loser hits a
 * P2002 unique-constraint error. Rather than propagating that error the caller
 * provides a `recoverFn` that fetches and returns the winning row.
 *
 * Kept in a separate module (no Prisma import) so it can be unit-tested
 * without a database connection.
 */

/**
 * Runs `createFn`. On a P2002 unique-constraint race the function falls
 * through to `recoverFn` to fetch and return the winning row.
 *
 * The duck-typed `code === "P2002"` check mirrors the pattern already used
 * elsewhere in this codebase (`actions.ts`, `stripe-provider.ts`) and avoids
 * coupling this utility to the Prisma client type.
 *
 * @throws The original error if `recoverFn` returns `null`, or if the error
 *         is not a P2002 constraint violation.
 */
export async function withP2002Fallback<T>(
  createFn: () => Promise<T>,
  recoverFn: () => Promise<T | null>,
): Promise<T> {
  try {
    return await createFn();
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      const winner = await recoverFn();
      if (winner !== null) return winner;
    }
    throw e;
  }
}
