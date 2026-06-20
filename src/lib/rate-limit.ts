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

import { type RateLimitStore, type RateLimitWindow } from "@/lib/ai/quota";
import { prisma } from "@/lib/prisma";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Max document imports allowed per client IP per window. */
export function importRateLimit(): number {
  return intFromEnv("IMPORT_RATE_LIMIT", 10);
}

/** Length of the import rate-limit window, in milliseconds (default 1 min). */
export function importRateWindowMs(): number {
  return intFromEnv("IMPORT_RATE_WINDOW_MS", 60_000);
}

/**
 * Max anonymous generations allowed per client IP per window. This is the
 * server-side throttle that backs the cookie trial: clearing the cookie does
 * not reset it because the window is persisted keyed by hashed IP.
 */
export function anonIpRateLimit(): number {
  return intFromEnv("ANON_IP_GENERATION_RATE_LIMIT", 20);
}

/**
 * Length of the anonymous per-IP generation window, in milliseconds
 * (default 1 hour).
 */
export function anonIpRateWindowMs(): number {
  return intFromEnv("ANON_IP_GENERATION_RATE_WINDOW_MS", 60 * 60 * 1000);
}

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
 * `RateLimitHit`-backed {@link RateLimitStore}. Persisting the window in a row
 * (instead of a per-instance Map) makes a limit hold across instances and, for
 * IP-keyed limits, survive a cookie reset. Shared by the import and generate
 * routes.
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
};
