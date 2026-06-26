/**
 * Shared, server-side rate limiting primitives for the public `/api` routes
 * (#96). These build on the pure fixed-window limiter in `@/lib/ai/quota` and
 * add the request-facing concerns that the limiter itself stays agnostic of:
 *
 *  - Extracting a caller identity from proxy headers (`getClientIp`).
 *  - Hashing that identity so the persisted key never stores a raw IP
 *    (`hashIdentifier`).
 *  - Namespacing keys per limiter so independent limits never collide
 *    (`rateLimitSubject`).
 *  - A `RateLimitHit`-backed {@link RateLimitStore} so a window survives across
 *    instances and — crucially for anonymous generation (#96, criterion 2) — is
 *    keyed server-side by hashed IP and therefore harder to reset than a local
 *    cookie.
 *  - A `Retry-After` seconds helper for 429 responses (criterion 4).
 *
 * Everything except {@link prismaRateLimitStore} is a pure function so it can be
 * unit-tested deterministically with no Next.js or database dependency.
 */

import crypto from "node:crypto";

import {
  type RateLimitStore,
  type RateLimitWindow,
  type RateLimitOptions,
  type RateLimitResult,
} from "@/lib/ai/quota";
import { prisma } from "@/lib/prisma";

/**
 * Extracts the originating client IP from standard proxy headers. Returns the
 * first entry of `x-forwarded-for` (the original client when set by a trusted
 * proxy), then falls back to `x-real-ip`. Returns `null` when neither header is
 * present so the caller can decide how to treat an unidentifiable client.
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return null;
}

/**
 * Hashes a caller identity (e.g. an IP) with HMAC-SHA256 keyed by `secret` so
 * the stored rate-limit key is fixed-length and never contains the raw IP. The
 * digest is truncated to 32 hex chars — ample to avoid collisions for this use.
 */
export function hashIdentifier(identifier: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(identifier)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Builds a namespaced subject key for the shared `RateLimitHit` store so that
 * independent limiters (e.g. `import` vs `anon-gen`) never share a window even
 * when they hash the same IP.
 */
export function rateLimitSubject(scope: string, identifier: string): string {
  return `${scope}:${identifier}`;
}

/**
 * Computes the `Retry-After` value (in whole seconds, minimum 1) for a window
 * that resets at `resetAt`. Pure so it can be asserted exactly in tests.
 */
export function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

/**
 * `RateLimitHit`-backed {@link RateLimitStore} with atomic increment (#482).
 *
 * Persisting the window in a row (instead of a per-instance Map) makes a limit
 * hold across instances and, for IP-keyed limits, survive a cookie reset.
 *
 * ## Atomicity guarantee (#482)
 *
 * The store implements `atomicIncrement` which collapses the previous
 * read-modify-write into a single conditional `updateMany` guarded by
 * `count < limit AND resetAt > now`. Prisma executes this as one DB-level
 * operation (a single UPDATE with a WHERE clause), so two concurrent requests
 * that both read count=N−1 cannot both succeed — exactly one UPDATE matches and
 * increments; the other sees 0 rows updated and is either blocked or starts a
 * new window (if expired).
 *
 * Bounded guarantee: the number of allowed requests within a window is bounded
 * to exactly `limit`. An overshoot of ≥1 at the critical boundary is not
 * possible under this scheme, as long as the underlying DB enforces row-level
 * write serialization (SQLite WAL mode, PostgreSQL MVCC).
 */
export const prismaRateLimitStore: RateLimitStore = {
  async get(key) {
    const row = await prisma.rateLimitHit.findUnique({
      where: { subject: key },
    });
    if (!row) {
      return undefined;
    }
    return { count: row.count, resetAt: row.resetAt.getTime() };
  },
  async set(key, window: RateLimitWindow) {
    const resetAt = new Date(window.resetAt);
    await prisma.rateLimitHit.upsert({
      where: { subject: key },
      create: { subject: key, count: window.count, resetAt },
      update: { count: window.count, resetAt },
    });
  },

  /**
   * Atomic conditional increment for the fixed-window rate limiter (#482).
   *
   * Decision tree (all in DB-level operations):
   *
   *  1. Try `updateMany WHERE subject=key AND count < limit AND resetAt > now,
   *     SET count = count + 1`.
   *     - If 1 row updated → allowed; re-read count and return.
   *  2. If 0 rows updated, fetch the current row:
   *     a. Row absent or expired (resetAt ≤ now) → upsert with count=1 and a
   *        fresh resetAt. Return allowed with count=1.
   *     b. Row present and not expired → blocked at limit.
   */
  async atomicIncrement(
    key: string,
    options: RateLimitOptions,
  ): Promise<RateLimitResult> {
    const { limit, windowMs, now } = options;
    const nowDate = new Date(now);
    const newResetAt = new Date(now + windowMs);

    // Phase 1: atomic conditional increment.
    const incremented = await prisma.rateLimitHit.updateMany({
      where: {
        subject: key,
        count: { lt: limit },
        resetAt: { gt: nowDate },
      },
      data: { count: { increment: 1 } },
    });

    if (incremented.count > 0) {
      // Read back to get the actual count after increment.
      const row = await prisma.rateLimitHit.findUnique({
        where: { subject: key },
      });
      const count = row?.count ?? 1;
      const resetAt = row?.resetAt.getTime() ?? now + windowMs;
      return {
        allowed: true,
        remaining: Math.max(0, limit - count),
        limit,
        resetAt,
      };
    }

    // Phase 2: no rows matched — either expired or blocked.
    const existing = await prisma.rateLimitHit.findUnique({
      where: { subject: key },
    });

    if (!existing || existing.resetAt.getTime() <= now) {
      // Window absent or expired — start a fresh window atomically.
      await prisma.rateLimitHit.upsert({
        where: { subject: key },
        create: { subject: key, count: 1, resetAt: newResetAt },
        update: { count: 1, resetAt: newResetAt },
      });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        limit,
        resetAt: newResetAt.getTime(),
      };
    }

    // Row exists, window not expired, count >= limit → blocked.
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt: existing.resetAt.getTime(),
    };
  },
};
