import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — TextIQ",
};

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) {
    redirect("/app");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-ds-surface-sunken px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-ds-xl border border-ds-border-subtle bg-ds-surface-raised p-8 shadow-ds-overlay">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            Forgot your password?
          </h1>
          <p className="text-sm text-ds-text-secondary">
            Enter your email and we&apos;ll send you a link to set a new one.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
