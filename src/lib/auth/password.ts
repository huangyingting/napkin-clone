/**
 * Pure, framework-free password rules shared by the change-password flow.
 *
 * Keeping the validation logic here (no bcrypt, no Prisma, no React) lets it be
 * unit-tested under `node --test` + `tsx` with no I/O, and keeps a single source
 * of truth for the minimum length and the user-facing rejection messages.
 */

/** Minimum number of characters required for a stored password. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validates a new password and its confirmation for the change/set-password
 * flow. Rejects passwords that are too short or that don't match their
 * confirmation; the messages are safe to surface directly (they describe the
 * caller's own input and leak nothing about the account).
 *
 * It deliberately does NOT verify the current password (that needs the stored
 * hash and bcrypt, which live in the server action) — this stays pure so it can
 * be unit-tested in isolation.
 */
export function validatePasswordChange(input: {
  newPassword: string;
  confirmPassword: string;
}): PasswordValidationResult {
  const { newPassword, confirmPassword } = input;

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, message: "New passwords don't match." };
  }

  return { ok: true };
}
