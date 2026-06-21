import type { Metadata } from "next";
import Link from "next/link";

import {
  VERIFICATION_TOKEN_REJECTION_MESSAGE,
  evaluateVerificationToken,
  hashVerificationToken,
} from "@/lib/auth/verification-token";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Verify your email — TextIQ",
};

type VerifyOutcome =
  | { status: "verified" }
  | { status: "error"; message: string };

/**
 * Consumes an email-verification token and stamps the owning user's
 * `emailVerified`.
 *
 * The token is looked up by its HASH (the raw value is never stored), evaluated
 * with the pure {@link evaluateVerificationToken} rules (exists, unused, not
 * expired), and on success — in one transaction — the user is marked verified,
 * the token is stamped used, and the user's other outstanding verification
 * tokens are invalidated so a second leaked link can't be replayed.
 */
async function consumeVerificationToken(
  rawToken: string,
): Promise<VerifyOutcome> {
  if (!rawToken) {
    return {
      status: "error",
      message: VERIFICATION_TOKEN_REJECTION_MESSAGE.not_found,
    };
  }

  try {
    const tokenHash = hashVerificationToken(rawToken);
    const record = await prisma.emailVerificationToken.findUnique({
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
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: usedAt },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt },
      }),
      prisma.emailVerificationToken.updateMany({
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

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const outcome = await consumeVerificationToken(decodeURIComponent(token));

  const verified = outcome.status === "verified";

  return (
    <main className="flex flex-1 items-center justify-center bg-ds-surface-sunken px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-ds-xl border border-ds-border-subtle bg-ds-surface-raised p-8 shadow-ds-overlay">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            {verified ? "Email verified" : "Verification failed"}
          </h1>
          <p
            className={
              verified
                ? "text-sm text-ds-text-secondary"
                : "text-sm text-ds-danger"
            }
            role={verified ? undefined : "alert"}
          >
            {verified
              ? "Thanks — your email address is now verified."
              : outcome.message}
          </p>
        </div>
        <Link
          href="/app/settings"
          className="flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover"
        >
          Back to settings
        </Link>
      </div>
    </main>
  );
}
