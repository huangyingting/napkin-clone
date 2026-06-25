import {
  buildPasswordResetUrl,
  deliverPasswordResetEmail,
} from "@/lib/auth/email";
import type {
  ForgotPasswordState,
  ResetPasswordState,
} from "@/lib/auth/form-state";
import {
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePasswordChange,
} from "@/lib/auth/password";
import {
  RESET_TOKEN_REJECTION_MESSAGE,
  RESET_TOKEN_TTL_MS,
  evaluateResetToken,
  generateResetToken,
  hashResetToken,
} from "@/lib/auth/reset-token";
import { singleUseTokenExpiresAt } from "@/lib/auth/single-use-token";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

type PrismaClientLike = typeof prisma;

export const GENERIC_PASSWORD_RESET_SENT_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password.";

const GENERIC_RESET_ERROR = "Could not reset your password. Please try again.";

export async function requestPasswordResetForEmail(
  rawEmail: FormDataEntryValue | string | null,
  client: PrismaClientLike = prisma,
): Promise<ForgotPasswordState> {
  const email = normalizeEmail(rawEmail);
  const emailValidation = validateEmail(email);
  if (!emailValidation.ok) {
    return { status: "error", message: emailValidation.message };
  }

  try {
    const user = await client.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (user) {
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = singleUseTokenExpiresAt(RESET_TOKEN_TTL_MS);

      await client.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      await deliverPasswordResetEmail({
        to: user.email,
        resetUrl: buildPasswordResetUrl(rawToken),
      });
    }
  } catch (error) {
    logError("password-reset", error);
  }

  return { status: "sent", message: GENERIC_PASSWORD_RESET_SENT_MESSAGE };
}

export async function resetPasswordWithToken(
  input: {
    token: FormDataEntryValue | string | null;
    newPassword: FormDataEntryValue | string | null;
    confirmPassword: FormDataEntryValue | string | null;
  },
  client: PrismaClientLike = prisma,
): Promise<ResetPasswordState> {
  const token = String(input.token ?? "");
  const newPassword = String(input.newPassword ?? "");
  const confirmPassword = String(input.confirmPassword ?? "");

  if (!token) {
    return {
      status: "error",
      message: RESET_TOKEN_REJECTION_MESSAGE.not_found,
    };
  }

  try {
    const tokenHash = hashResetToken(token);
    const record = await client.passwordResetToken.findUnique({
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

    const passwordHash = await hashPassword(newPassword);
    const usedAt = new Date();

    await client.$transaction([
      client.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      client.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt },
      }),
      client.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
        data: { usedAt },
      }),
    ]);

    return { status: "success" };
  } catch (error) {
    logError("password-reset", error);
    return { status: "error", message: GENERIC_RESET_ERROR };
  }
}
