"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { signOut } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { validatePasswordChange } from "@/lib/auth/password";
import {
  deliverVerificationEmail,
  type VerificationEmail,
} from "@/lib/auth/verification-email";
import {
  VERIFICATION_TOKEN_TTL_MS,
  generateVerificationToken,
  hashVerificationToken,
} from "@/lib/auth/verification-token";
import {
  getBillingProvider,
  shouldCancelSubscription,
} from "@/lib/billing/provider";
import { getSubscriptionCancellationState } from "@/lib/billing/service";
import { publicAppUrl } from "@/lib/client-config";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** Maximum stored display-name length. */
const MAX_NAME_LENGTH = 100;

/** bcrypt cost factor — matches sign-up so all hashes are comparable. */
const BCRYPT_COST = 12;

/** Generic fallback so a failed change never leaks account state. */
const GENERIC_PASSWORD_ERROR =
  "Could not change your password. Please try again.";

/** Literal keyword accepted as a confirmation alternative to the email. */
const DELETE_CONFIRMATION_KEYWORD = "DELETE";

/** Generic fallback so a failed deletion never leaks account state. */
const GENERIC_DELETE_ERROR = "Could not delete your account. Please try again.";

export type ProfileResult = ActionResult<{ name: string }>;

/**
 * Updates the current user's display name.
 *
 * The write is scoped to the authenticated user by keying on the session
 * `user.id` (never a client-supplied id), so it can only change the caller's own
 * profile. The name is trimmed and length-clamped; an empty value clears the name
 * (stored as `null`) so the header/menu falls back to the email.
 *
 * The header user menu and dashboard greeting read the name/email server-side
 * from the database, so revalidating the root layout makes a saved change show
 * immediately and persist after reload (the JWT session token still holds the
 * name captured at sign-in).
 */
export async function updateProfile(
  _prevState: ProfileResult | null,
  formData: FormData,
): Promise<ProfileResult> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  await prisma.user.update({
    where: { id: user.id },
    data: { name: name || null },
  });

  revalidatePath("/app/settings");
  revalidatePath("/", "layout");

  return actionOk({ name });
}

export type PasswordResult = ActionResult;

/**
 * Changes (or sets) the current user's password.
 *
 * Scoped to the authenticated user by keying on the session `user.id` (never a
 * client-supplied id). For an account that already has a password the caller
 * must prove they know the current one (verified with bcrypt); a Google-only
 * account (no `passwordHash`) can *set* a password without a current one. The
 * new password and its confirmation are validated by the pure
 * `validatePasswordChange` helper, and an incorrect current password yields a
 * generic message so nothing about the account is leaked.
 */
export async function changePassword(
  _prevState: PasswordResult | null,
  formData: FormData,
): Promise<PasswordResult> {
  const user = await requireUser();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) {
    return actionError(GENERIC_PASSWORD_ERROR);
  }

  const validation = validatePasswordChange({ newPassword, confirmPassword });
  if (!validation.ok) {
    return actionError(validation.message);
  }

  if (dbUser.passwordHash) {
    const currentMatches =
      currentPassword.length > 0 &&
      (await bcrypt.compare(currentPassword, dbUser.passwordHash));
    if (!currentMatches) {
      return actionError("Your current password is incorrect.");
    }

    const sameAsCurrent = await bcrypt.compare(
      newPassword,
      dbUser.passwordHash,
    );
    if (sameAsCurrent) {
      return actionError(
        "New password must be different from your current password.",
      );
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return actionOk();
}

export type DeleteAccountResult = ActionResult;

/**
 * Permanently deletes the current user's account.
 *
 * Scoped to the authenticated user by keying the delete on the session
 * `user.id` (never a client-supplied id), so a caller can only delete their own
 * account. As a guard against accidents the caller must confirm by typing their
 * exact email address (case-insensitive) or the literal word "DELETE".
 *
 * Deleting the `User` row cascades — via the schema's `onDelete: Cascade`
 * relations — to the user's owned documents (and each document's visuals and
 * comments), owned workspaces (and their memberships and invite links), their
 * workspace memberships, and the comments they authored on other documents.
 *
 * On success the session cookie is cleared and the user is sent to the marketing
 * home. `signOut` performs that redirect by throwing, so it must run last and
 * stay outside any try/catch (the trailing return is unreachable but satisfies
 * the action's return type).
 */
export async function deleteAccount(
  _prevState: DeleteAccountResult | null,
  formData: FormData,
): Promise<DeleteAccountResult> {
  const user = await requireUser();

  const confirmation = String(formData.get("confirmation") ?? "").trim();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!dbUser) {
    return actionError(GENERIC_DELETE_ERROR);
  }

  const matchesEmail =
    confirmation.toLowerCase() === dbUser.email.trim().toLowerCase();
  const matchesKeyword = confirmation === DELETE_CONFIRMATION_KEYWORD;
  if (!matchesEmail && !matchesKeyword) {
    return actionError(
      `Type your email or "${DELETE_CONFIRMATION_KEYWORD}" to confirm.`,
    );
  }

  try {
    const sub = await getSubscriptionCancellationState(user.id);

    if (shouldCancelSubscription(sub)) {
      try {
        const billing = await getBillingProvider();
        await billing.cancelSubscriptionImmediately(user.id);
      } catch (err) {
        // Fail-safe: log the Stripe error but allow account deletion to proceed
        // so a billing issue never traps a user who wants to leave.
        logError("billing.subscription.cancel_immediate", err, {
          userId: user.id,
          reason: "account-deletion",
        });
      }
    }

    await prisma.user.delete({ where: { id: user.id } });
  } catch {
    return actionError(GENERIC_DELETE_ERROR);
  }

  await signOut({ redirectTo: "/" });
  // Unreachable: signOut redirects by throwing. Returned only to satisfy the
  // action's return type.
  return actionOk();
}

/** Builds the absolute, ready-to-click email-verification URL with the token. */
function buildVerifyUrl(rawToken: string): string {
  const base = publicAppUrl();
  return `${base.replace(/\/$/, "")}/verify-email/${encodeURIComponent(rawToken)}`;
}

/** Generic fallback so a failed verification request stays uninformative. */
const GENERIC_VERIFICATION_ERROR =
  "Could not send a verification email. Please try again.";

/**
 * Success payload for {@link requestEmailVerification}: distinguishes a freshly
 * sent link from a short-circuit when the address was already verified.
 */
export type VerifyEmailResult = ActionResult<{
  status: "sent" | "already_verified";
}>;

/**
 * Sends an email-verification link to the current user's own address (#162).
 *
 * Scoped to the authenticated user by keying on the session `user.id` (never a
 * client-supplied id). There is no user-enumeration concern — the recipient is
 * the logged-in user's own, already-known email — so this returns specific
 * states. If the address is already verified it short-circuits. Otherwise it
 * generates a high-entropy token, stores only its HASH with a short expiry (so a
 * database leak can't be replayed), invalidates the user's other outstanding
 * verification tokens, and hands the raw-token link to the delivery seam.
 */
export async function requestEmailVerification(
  _prevState: VerifyEmailResult | null,
  _formData: FormData,
): Promise<VerifyEmailResult> {
  const user = await requireUser();

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
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
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.emailVerificationToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      }),
    ]);

    const message: VerificationEmail = {
      to: dbUser.email,
      verifyUrl: buildVerifyUrl(rawToken),
    };
    await deliverVerificationEmail(message);

    return actionOk({ status: "sent" });
  } catch (error) {
    logError("email-verification", error);
    return actionError(GENERIC_VERIFICATION_ERROR);
  }
}
