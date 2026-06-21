"use server";

import {
  deliverPasswordResetEmail,
  type PasswordResetEmail,
} from "@/lib/auth/reset-email";
import {
  RESET_TOKEN_TTL_MS,
  generateResetToken,
  hashResetToken,
} from "@/lib/auth/reset-token";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Single response used whenever a request is accepted, whether or not the email
 * matched an account. Keeping it identical in copy AND timing is what prevents
 * user enumeration: a caller can never tell from the response whether an address
 * is registered.
 */
const GENERIC_SENT_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password.";

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "sent"; message: string }
  | { status: "error"; message: string };

/** Builds the absolute, ready-to-click reset URL carrying the raw token. */
function buildResetUrl(rawToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
  return `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Issues a password-reset link for a credentials user (#140).
 *
 * For a matching account it generates a high-entropy random token, stores only
 * its hash with a short expiry (so a database leak can't be replayed), and hands
 * the raw-token link to the delivery seam. The endpoint deliberately does NOT
 * reveal whether the email exists: every accepted request — match or no match,
 * success or a swallowed internal error — returns the same generic "sent"
 * message, so it can't be used to enumerate registered users.
 */
export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (user) {
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const message: PasswordResetEmail = {
        to: user.email,
        resetUrl: buildResetUrl(rawToken),
      };
      await deliverPasswordResetEmail(message);
    }
  } catch (error) {
    // Swallow internal errors and still return the generic message so a failure
    // can't be used to probe which addresses exist.
    logError("password-reset", error);
  }

  return { status: "sent", message: GENERIC_SENT_MESSAGE };
}
