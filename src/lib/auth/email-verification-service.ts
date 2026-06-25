import { actionError, actionOk } from "@/lib/action-result";
import {
  buildEmailVerificationUrl,
  deliverVerificationEmail,
} from "@/lib/auth/email";
import type { VerifyEmailResult } from "@/lib/auth/form-state";
import {
  VERIFICATION_TOKEN_REJECTION_MESSAGE,
  VERIFICATION_TOKEN_TTL_MS,
  evaluateVerificationToken,
  generateVerificationToken,
  hashVerificationToken,
} from "@/lib/auth/verification-token";
import { singleUseTokenExpiresAt } from "@/lib/auth/single-use-token";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

type PrismaClientLike = typeof prisma;

export type VerifyOutcome =
  | { status: "verified" }
  | { status: "error"; message: string };

const GENERIC_VERIFICATION_ERROR =
  "Could not send a verification email. Please try again.";

export async function requestEmailVerificationForUser(
  userId: string,
  client: PrismaClientLike = prisma,
): Promise<VerifyEmailResult> {
  try {
    const dbUser = await client.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });
    if (!dbUser) {
      return actionError(GENERIC_VERIFICATION_ERROR);
    }
    if (dbUser.emailVerified) {
      return actionOk({ status: "already_verified" });
    }

    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const expiresAt = singleUseTokenExpiresAt(VERIFICATION_TOKEN_TTL_MS);
    const usedAt = new Date();

    await client.$transaction([
      client.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt },
      }),
      client.emailVerificationToken.create({
        data: { userId, tokenHash, expiresAt },
      }),
    ]);

    await deliverVerificationEmail({
      to: dbUser.email,
      verifyUrl: buildEmailVerificationUrl(rawToken),
    });

    return actionOk({ status: "sent" });
  } catch (error) {
    logError("email-verification", error);
    return actionError(GENERIC_VERIFICATION_ERROR);
  }
}

export async function consumeEmailVerificationToken(
  rawToken: string,
  client: PrismaClientLike = prisma,
): Promise<VerifyOutcome> {
  if (!rawToken) {
    return {
      status: "error",
      message: VERIFICATION_TOKEN_REJECTION_MESSAGE.not_found,
    };
  }

  try {
    const tokenHash = hashVerificationToken(rawToken);
    const record = await client.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    const evaluation = evaluateVerificationToken({
      exists: record !== null,
      expiresAt: record?.expiresAt ?? null,
      usedAt: record?.usedAt ?? null,
      now: new Date(),
    });

    if (!evaluation.valid || record === null) {
      return {
        status: "error",
        message: evaluation.valid
          ? VERIFICATION_TOKEN_REJECTION_MESSAGE.not_found
          : VERIFICATION_TOKEN_REJECTION_MESSAGE[evaluation.reason],
      };
    }

    const usedAt = new Date();
    await client.$transaction([
      client.user.update({
        where: { id: record.userId },
        data: { emailVerified: usedAt },
      }),
      client.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt },
      }),
      client.emailVerificationToken.updateMany({
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
        data: { usedAt },
      }),
    ]);

    return { status: "verified" };
  } catch (error) {
    logError("email-verification", error);
    return {
      status: "error",
      message: "Could not verify your email. Please try again.",
    };
  }
}
