"use server";

import type { ResetPasswordState } from "@/lib/auth/form-state";
import { resetPasswordWithToken } from "@/lib/auth/password-reset-service";
import {
  checkServerActionAbuseBudget,
  retryMessage,
} from "@/lib/server-action-abuse";

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
  const budget = await checkServerActionAbuseBudget(
    "auth.password-reset.token",
    token || "missing-token",
  );
  if (!budget.allowed) {
    return {
      status: "error",
      message: retryMessage(budget.retryAfterSeconds),
    };
  }

  return resetPasswordWithToken({
    token,
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
}
