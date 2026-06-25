import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  GoogleSignInButton,
  OrDivider,
} from "@/components/google-sign-in-button";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { isGoogleAuthConfigured } from "@/lib/auth/google-provider";
import { routeProtectionPolicy } from "@/lib/auth/route-protection-policy";
import { getCurrentUser } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in — TextIQ",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string }>;
}) {
  if (await getCurrentUser()) {
    redirect(routeProtectionPolicy.authenticatedHome);
  }

  const { callbackUrl: rawCallbackUrl, error } = await searchParams;
  const callbackUrl = safeCallbackUrl(
    Array.isArray(rawCallbackUrl) ? rawCallbackUrl[0] : rawCallbackUrl,
  );
  const googleAvailable = isGoogleAuthConfigured();

  return (
    <main className="flex flex-1 items-center justify-center bg-ds-surface-sunken px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-ds-xl border border-ds-border-subtle bg-ds-surface-raised p-8 shadow-ds-overlay">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            Welcome back
          </h1>
          <p className="text-sm text-ds-text-secondary">
            Log in to your TextIQ account.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          {error === "OAuthError" ? (
            <p role="alert" className="text-sm text-ds-danger">
              Google sign-in failed. Please try again or use email and password.
            </p>
          ) : null}
          {googleAvailable ? (
            <>
              <GoogleSignInButton
                callbackUrl={callbackUrl}
                errorRedirectPath="/login"
              />
              <OrDivider />
            </>
          ) : null}
          <LoginForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
