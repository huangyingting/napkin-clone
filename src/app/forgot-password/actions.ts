"use server";

import type { ForgotPasswordState } from "@/lib/auth/form-state";
import { normalizeEmail } from "@/lib/auth/password";
import {
  GENERIC_PASSWORD_RESET_SENT_MESSAGE,
  requestPasswordResetForEmail,
} from "@/lib/auth/password-reset-service";
import { withAbuseBudget } from "@/lib/server-action-abuse";

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
  const email = normalizeEmail(formData.get("email"));
  return withAbuseBudget(
    "auth.password-reset.email",
    email || "missing-email",
    async () => requestPasswordResetForEmail(email),
    () => ({ status: "sent", message: GENERIC_PASSWORD_RESET_SENT_MESSAGE }),
  );
}
