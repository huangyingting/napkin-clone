/**
 * Pure, framework-free helpers for the email-verification flow (#162).
 *
 * Everything here is I/O-free (only `node:crypto`, no Prisma, no Next.js, no
 * React) so it can be unit-tested under `node --test` + `tsx` and kept as the
 * single source of truth for:
 *
 *  - how a raw verification token is generated (`generateVerificationToken`),
 *  - how it is hashed for storage (`hashVerificationToken` — only the hash is
 *    ever persisted, so a database leak cannot be replayed),
 *  - how long a token lives (`VERIFICATION_TOKEN_TTL_MS`), and
 *  - whether a looked-up token may be used right now
 *    (`evaluateVerificationToken`).
 *
 * The server action / route does the database reads/writes; this module decides.
 * It deliberately mirrors `reset-token.ts` so both flows share the same proven,
 * hash-only, single-use, time-boxed token shape.
 */

import crypto from "node:crypto";

/** How long a verification token stays valid after it is issued (24 hours). */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Number of random bytes behind a raw verification token (256 bits). */
const TOKEN_BYTES = 32;

/**
 * Generates a cryptographically-random, URL-safe verification token. The raw
 * value is emailed to the user and never stored; only its
 * {@link hashVerificationToken} digest is persisted.
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a raw verification token with SHA-256 (hex) for storage and lookup. A
 * plain unsalted hash is appropriate here — the token is high-entropy random, so
 * it is not subject to dictionary/brute-force attacks the way a password would
 * be, and a deterministic digest lets us look the row up by `tokenHash`.
 */
export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Why a token can't be used, when {@link evaluateVerificationToken} rejects. */
export type VerificationTokenRejection = "not_found" | "used" | "expired";

export type VerificationTokenEvaluation =
  | { valid: true }
  | { valid: false; reason: VerificationTokenRejection };

/**
 * Decides whether a verification token may be used *now*, given the facts about
 * the looked-up row. A token is valid only when it exists, has not already been
 * consumed (`usedAt` is null), and has not expired (`now < expiresAt`). Order
 * matters: a missing row is reported before anything else, and a token that is
 * both used and expired reports `used` (it was already spent).
 *
 * Pure and DOM-free so the decision can be asserted exactly in unit tests.
 */
export function evaluateVerificationToken(input: {
  exists: boolean;
  expiresAt: Date | null;
  usedAt: Date | null;
  now: Date;
}): VerificationTokenEvaluation {
  const { exists, expiresAt, usedAt, now } = input;

  if (!exists || expiresAt === null) {
    return { valid: false, reason: "not_found" };
  }

  if (usedAt !== null) {
    return { valid: false, reason: "used" };
  }

  if (now.getTime() >= expiresAt.getTime()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true };
}

/** User-facing copy for each rejection reason (safe to surface directly). */
export const VERIFICATION_TOKEN_REJECTION_MESSAGE: Record<
  VerificationTokenRejection,
  string
> = {
  not_found:
    "This verification link is invalid. Request a new one from settings.",
  used: "This email has already been verified.",
  expired:
    "This verification link has expired. Request a new one from settings.",
};
