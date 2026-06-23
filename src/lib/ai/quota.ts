/**
 * Quota + rate limiting for the generation endpoint (US-010).
 *
 * Two independent mechanisms:
 *
 *  1. Anonymous trial quota — a NON-resetting lifetime allowance tracked by a
 *     signed (HMAC-SHA256) cookie carrying a random anonymous id plus a usage
 *     count. Signing prevents trivial tampering; the count lives in the cookie
 *     so no datastore is required and there is no time-based reset. Tracking is
 *     by cookie id, never by IP.
 *
 *  2. Authenticated per-user rate limit — a fixed-window limiter keyed by user
 *     id. The window store is supplied by the caller via an abstraction: the
 *     route backs it with a `RateLimitHit` table (shared across instances) while
 *     tests use an in-memory fake. The decision logic itself stays pure and
 *     testable.
 */

import crypto from "node:crypto";

/** Name of the signed anonymous-id cookie. */
export const ANON_COOKIE_NAME = "textiq_anon";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Lifetime number of free generations for an anonymous visitor. */
export function anonTrialLimit(): number {
  return intFromEnv("ANON_GENERATION_LIMIT", 5);
}

/** Max authenticated generations allowed per user per window. */
export function userRateLimit(): number {
  return intFromEnv("USER_GENERATION_RATE_LIMIT", 30);
}

/** Length of the authenticated rate-limit window, in milliseconds. */
export function userRateWindowMs(): number {
  return intFromEnv("USER_GENERATION_RATE_WINDOW_MS", 60_000);
}

export interface AnonState {
  id: string;
  count: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Creates a fresh anonymous state with a random id and zero usage. */
export function newAnonState(): AnonState {
  return { id: crypto.randomUUID(), count: 0 };
}

/** Serializes and signs an {@link AnonState} into a cookie value. */
export function signAnonState(state: AnonState, secret: string): string {
  const payload = base64url(JSON.stringify(state));
  return `${payload}.${hmac(payload, secret)}`;
}

/**
 * Verifies and parses a signed anon cookie value. Returns `null` for a missing,
 * malformed, or tampered value (caller should then mint a {@link newAnonState}).
 */
export function parseAnonCookie(
  value: string | undefined | null,
  secret: string,
): AnonState | null {
  if (!value) {
    return null;
  }
  const dot = value.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!timingSafeEqual(signature, hmac(payload, secret))) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as { id?: unknown }).id !== "string" ||
    typeof (decoded as { count?: unknown }).count !== "number"
  ) {
    return null;
  }

  const { id, count } = decoded as AnonState;
  if (!id || !Number.isFinite(count) || count < 0) {
    return null;
  }

  return { id, count: Math.floor(count) };
}

export interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * Pure fixed-window decision. Given the current window for a subject (or
 * `undefined` when there is none), returns the {@link RateLimitResult} plus the
 * window that should be persisted (`next`) — or `null` when nothing should be
 * written (the request was blocked, so the stored window is left untouched).
 *
 * The window is first-request-anchored: the first hit sets
 * `resetAt = now + windowMs`, and the window resets once `now >= resetAt`. This
 * logic is shared by the in-memory {@link checkRateLimit} and the async,
 * store-backed {@link checkRateLimitWithStore} so both behave identically.
 */
function computeRateLimit(
  existing: RateLimitWindow | undefined,
  { limit, windowMs, now }: RateLimitOptions,
): { result: RateLimitResult; next: RateLimitWindow | null } {
  if (!existing || now >= existing.resetAt) {
    const next: RateLimitWindow = { count: 1, resetAt: now + windowMs };
    return {
      result: {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        limit,
        resetAt: next.resetAt,
      },
      next,
    };
  }

  if (existing.count >= limit) {
    return {
      result: {
        allowed: false,
        remaining: 0,
        limit,
        resetAt: existing.resetAt,
      },
      next: null,
    };
  }

  const next: RateLimitWindow = {
    count: existing.count + 1,
    resetAt: existing.resetAt,
  };
  return {
    result: {
      allowed: true,
      remaining: Math.max(0, limit - next.count),
      limit,
      resetAt: existing.resetAt,
    },
    next,
  };
}

/**
 * Fixed-window rate limiter backed by an in-memory `Map`. Records the request
 * in `store[key]` when allowed; the window resets once `now >= resetAt`.
 */
export function checkRateLimit(
  store: Map<string, RateLimitWindow>,
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const { result, next } = computeRateLimit(store.get(key), options);
  if (next) {
    store.set(key, next);
  }
  return result;
}

/**
 * Async store abstraction for the fixed-window limiter. The route backs this
 * with a `RateLimitHit` table so the limit is shared across instances; tests
 * back it with an in-memory fake. `get` returns the subject's current window
 * (or `undefined`); `set` persists a window for the subject.
 *
 * Cost-bearing stores should implement the optional `atomicIncrement` method
 * to eliminate the get→compute→set race that can allow a small overshoot under
 * concurrency. When present, {@link checkRateLimitWithStore} delegates to it
 * instead of the two-phase read-modify-write (#482).
 */
export interface RateLimitStore {
  get(key: string): Promise<RateLimitWindow | undefined>;
  set(key: string, window: RateLimitWindow): Promise<void>;
  /**
   * Optional atomic increment (#482).
   *
   * Performs a single DB-level operation that increments the window count by 1
   * when `count < limit` and the window has not expired, or resets the window
   * when it has expired.
   *
   * Returns the resulting {@link RateLimitResult} directly. When this method is
   * present, {@link checkRateLimitWithStore} uses it instead of the two-phase
   * get → compute → set path, eliminating the race where two concurrent
   * requests each read the same count and both succeed past the limit.
   *
   * Guarantee: the number of allowed increments within a window is bounded to
   * exactly `limit`. An overshoot of ≥1 is not possible as long as the
   * underlying DB operation is atomic (conditional `updateMany` + upsert).
   */
  atomicIncrement?(
    key: string,
    options: RateLimitOptions,
  ): Promise<RateLimitResult>;
}

/**
 * Store-backed counterpart of {@link checkRateLimit}. When the store provides
 * {@link RateLimitStore.atomicIncrement}, delegates to it for an atomically
 * bounded guarantee (no overshoot, #482). Otherwise falls back to the
 * read-modify-write path.
 *
 * The atomic path ensures that exactly `limit` requests succeed per window
 * even under high concurrency across multiple instances.
 */
export async function checkRateLimitWithStore(
  store: RateLimitStore,
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  if (store.atomicIncrement) {
    return store.atomicIncrement(key, options);
  }
  const { result, next } = computeRateLimit(await store.get(key), options);
  if (next) {
    await store.set(key, next);
  }
  return result;
}
