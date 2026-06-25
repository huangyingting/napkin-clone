"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { normalizeEmail } from "@/lib/auth/password";
import {
  checkServerActionAbuseBudget,
  retryMessage,
} from "@/lib/server-action-abuse";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const email = normalizeEmail(formData.get("email"));
  const budget = await checkServerActionAbuseBudget(
    "auth.login.email",
    email || "missing-email",
  );
  if (!budget.allowed) {
    return retryMessage(budget.retryAfterSeconds);
  }

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
}
