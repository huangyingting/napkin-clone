/**
 * Pure, framework-free helpers for the self-serve password reset flow (#140).
 *
 * Everything here is I/O-free (no Prisma, no Next.js, no
 * React) so it can be unit-tested under `node --test` + `tsx` and kept as the
 * single source of truth for:
 *
 *  - how a raw reset token is generated (`generateResetToken`),
 *  - how it is hashed for storage (`hashResetToken` — only the hash is ever
 *    persisted, so a database leak cannot be replayed),
 *  - how long a token lives (`RESET_TOKEN_TTL_MS`), and
 *  - whether a looked-up token may be used right now (`evaluateResetToken`).
 *
 * The server action does the database reads/writes; this module decides.
 */

import {
  evaluateSingleUseToken,
  generateSingleUseToken,
  hashSingleUseToken,
  type SingleUseTokenEvaluation,
  type SingleUseTokenRejection,
} from "@/lib/auth/single-use-token";

/** How long a reset token stays valid after it is issued (1 hour). */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Generates a cryptographically-random, URL-safe reset token. The raw value is
 * emailed to the user and never stored; only its {@link hashResetToken} digest
 * is persisted.
 */
export function generateResetToken(): string {
  return generateSingleUseToken();
}

/**
 * Hashes a raw reset token with SHA-256 (hex) for storage and lookup. A plain
 * unsalted hash is appropriate here — the token is high-entropy random, so it is
 * not subject to dictionary/brute-force attacks the way a password would be, and
 * a deterministic digest lets us look the row up by `tokenHash`.
 */
export function hashResetToken(rawToken: string): string {
  return hashSingleUseToken(rawToken);
}

/** Why a token can't be used, when {@link evaluateResetToken} rejects it. */
export type ResetTokenRejection = SingleUseTokenRejection;

export type ResetTokenEvaluation = SingleUseTokenEvaluation;

/**
 * Decides whether a reset token may be used *now*, given the facts about the
 * looked-up row. A token is valid only when it exists, has not already been
 * consumed (`usedAt` is null), and has not expired (`now < expiresAt`). Order
 * matters: a missing row is reported before anything else, and a token that is
 * both used and expired reports `used` (it was already spent).
 *
 * Pure and DOM-free so the decision can be asserted exactly in unit tests.
 */
export function evaluateResetToken(input: {
  exists: boolean;
  expiresAt: Date | null;
  usedAt: Date | null;
  now: Date;
}): ResetTokenEvaluation {
  return evaluateSingleUseToken(input);
}

/** User-facing copy for each rejection reason (safe to surface directly). */
export const RESET_TOKEN_REJECTION_MESSAGE: Record<
  ResetTokenRejection,
  string
> = {
  not_found: "This reset link is invalid. Please request a new one.",
  used: "This reset link has already been used. Please request a new one.",
  expired: "This reset link has expired. Please request a new one.",
};
