"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { normalizeEmail } from "@/lib/auth/password";
import { retryMessage, withAbuseBudget } from "@/lib/server-action-abuse";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const email = normalizeEmail(formData.get("email"));
  return withAbuseBudget(
    "auth.login.email",
    email || "missing-email",
    async () => {
      try {
        await signIn("credentials", {
          email,
          password: String(formData.get("password") ?? ""),
          redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
        });
      } catch (error) {
        if (error instanceof AuthError) {
          return "Invalid email or password.";
        }
        throw error;
      }
      return undefined;
    },
    retryMessage,
  );
}
