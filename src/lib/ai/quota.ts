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
 *     id. The window store is provided by the caller (a module-level Map in the
 *     route) so the logic itself stays pure and testable.
 */

import crypto from "node:crypto";

/** Name of the signed anonymous-id cookie. */
export const ANON_COOKIE_NAME = "napkin_anon";

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
 * Fixed-window rate limiter. Mutates `store[key]` to record the request when
 * allowed. The window resets once `now >= resetAt`.
 */
export function checkRateLimit(
  store: Map<string, RateLimitWindow>,
  key: string,
  { limit, windowMs, now }: RateLimitOptions,
): RateLimitResult {
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    const window: RateLimitWindow = { count: 1, resetAt: now + windowMs };
    store.set(key, window);
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      limit,
      resetAt: window.resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt,
  };
}
