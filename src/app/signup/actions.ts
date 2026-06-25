"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { registerCredentialsUser } from "@/lib/auth/credentials-service";

export async function register(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const registered = await registerCredentialsUser({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!registered.ok) {
    return registered.error;
  }

  try {
    await signIn("credentials", {
      email: registered.data.email,
      password: registered.data.password,
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Account created, but automatic sign-in failed. Please log in.";
    }
    throw error;
  }

  return undefined;
}
