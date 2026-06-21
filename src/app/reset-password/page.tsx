import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password — TextIQ",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (await getCurrentUser()) {
    redirect("/app");
  }

  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : (rawToken ?? "");

  return (
    <main className="flex flex-1 items-center justify-center bg-ds-surface-sunken px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-ds-xl border border-ds-border-subtle bg-ds-surface-raised p-8 shadow-ds-overlay">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            Set a new password
          </h1>
          <p className="text-sm text-ds-text-secondary">
            Choose a new password for your TextIQ account.
          </p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="flex w-full flex-col gap-4">
            <p role="alert" className="text-sm text-ds-danger">
              This reset link is invalid or incomplete. Please request a new
              one.
            </p>
            <Link
              href="/forgot-password"
              className="flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover"
            >
              Request a new link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
