"use server";

import bcrypt from "bcryptjs";

import { validatePasswordChange } from "@/lib/auth/password";
import {
  RESET_TOKEN_REJECTION_MESSAGE,
  evaluateResetToken,
  hashResetToken,
} from "@/lib/auth/reset-token";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

/** bcrypt cost factor — matches sign-up and change-password so hashes align. */
const BCRYPT_COST = 12;

/** Generic fallback so a failed reset never leaks account state. */
const GENERIC_ERROR = "Could not reset your password. Please try again.";

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Completes a password reset (#140).
 *
 * Validates the token (exists, not used, not expired) and the new password
 * (reusing the shared `validatePasswordChange` rules), then in one transaction
 * hashes the new password with bcrypt, updates the user, stamps the token used,
 * and invalidates every other outstanding token for that user so a second
 * leaked link can't be replayed. The token is looked up by its HASH — the raw
 * value is never stored.
 */
export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return {
      status: "error",
      message: RESET_TOKEN_REJECTION_MESSAGE.not_found,
    };
  }

  try {
    const tokenHash = hashResetToken(token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    const evaluation = evaluateResetToken({
      exists: record !== null,
      expiresAt: record?.expiresAt ?? null,
      usedAt: record?.usedAt ?? null,
      now: new Date(),
    });
    if (!evaluation.valid || record === null) {
      return {
        status: "error",
        message: evaluation.valid
          ? RESET_TOKEN_REJECTION_MESSAGE.not_found
          : RESET_TOKEN_REJECTION_MESSAGE[evaluation.reason],
      };
    }

    const validation = validatePasswordChange({ newPassword, confirmPassword });
    if (!validation.ok) {
      return { status: "error", message: validation.message };
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const usedAt = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
        data: { usedAt },
      }),
    ]);

    return { status: "success" };
  } catch (error) {
    logError("password-reset", error);
    return { status: "error", message: GENERIC_ERROR };
  }
}
