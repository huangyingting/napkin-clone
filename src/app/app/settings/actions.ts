"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { validatePasswordChange } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** Maximum stored display-name length. */
const MAX_NAME_LENGTH = 100;

/** bcrypt cost factor — matches sign-up so all hashes are comparable. */
const BCRYPT_COST = 12;

/** Generic fallback so a failed change never leaks account state. */
const GENERIC_PASSWORD_ERROR =
  "Could not change your password. Please try again.";

export type ProfileFormState =
  | { status: "idle" }
  | { status: "success"; name: string }
  | { status: "error"; message: string };

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
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
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

  return { status: "success", name };
}

export type PasswordFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

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
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const user = await requireUser();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) {
    return { status: "error", message: GENERIC_PASSWORD_ERROR };
  }

  const validation = validatePasswordChange({ newPassword, confirmPassword });
  if (!validation.ok) {
    return { status: "error", message: validation.message };
  }

  if (dbUser.passwordHash) {
    const currentMatches =
      currentPassword.length > 0 &&
      (await bcrypt.compare(currentPassword, dbUser.passwordHash));
    if (!currentMatches) {
      return {
        status: "error",
        message: "Your current password is incorrect.",
      };
    }

    const sameAsCurrent = await bcrypt.compare(
      newPassword,
      dbUser.passwordHash,
    );
    if (sameAsCurrent) {
      return {
        status: "error",
        message: "New password must be different from your current password.",
      };
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return { status: "success" };
}
