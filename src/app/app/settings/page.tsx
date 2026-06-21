import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isGoogleAuthConfigured } from "@/lib/auth/google-provider";
import { deriveConnectedAccounts } from "@/lib/auth/connected-accounts";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { EmailVerificationForm } from "./email-verification-form";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = {
  title: "Settings — TextIQ",
};

export default async function SettingsPage() {
  const sessionUser = await requireUser();

  // Read fresh from the database so the form shows the current name even after a
  // previous save (the JWT session token still holds the sign-in-time name).
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      emailVerified: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const hasPassword = Boolean(user.passwordHash);
  const isEmailVerified = Boolean(user.emailVerified);
  const connectedAccounts = deriveConnectedAccounts({
    hasPassword,
    image: user.image,
    googleConfigured: isGoogleAuthConfigured(),
  });

  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            Settings
          </h1>
          <p className="text-sm text-ds-text-secondary">
            Manage your account profile.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ds-text-primary">
              Profile
            </h2>
            <p className="text-sm text-ds-text-secondary">
              Update your display name.
            </p>
          </div>
          <ProfileForm initialName={user.name ?? ""} email={user.email} />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ds-text-primary">
                Email verification
              </h2>
              {isEmailVerified ? (
                <span className="rounded-ds-pill bg-ds-success/10 px-2 py-0.5 text-xs font-medium text-ds-success">
                  Verified
                </span>
              ) : (
                <span className="rounded-ds-pill bg-ds-surface-sunken px-2 py-0.5 text-xs font-medium text-ds-text-secondary">
                  Unverified
                </span>
              )}
            </div>
            <p className="text-sm text-ds-text-secondary">
              {isEmailVerified
                ? `Your email ${user.email} is verified.`
                : `Confirm ${user.email} to secure your account.`}
            </p>
          </div>
          {isEmailVerified ? null : <EmailVerificationForm />}
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ds-text-primary">
              {hasPassword ? "Change password" : "Set a password"}
            </h2>
            <p className="text-sm text-ds-text-secondary">
              {hasPassword
                ? "Update the password you use to sign in."
                : "Add a password so you can sign in with your email too."}
            </p>
          </div>
          <PasswordForm hasPassword={hasPassword} />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ds-text-primary">
              Connected accounts
            </h2>
            <p className="text-sm text-ds-text-secondary">
              Sign-in methods linked to your account.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {connectedAccounts
              .filter((account) => account.available)
              .map((account) => (
                <li
                  key={account.provider}
                  className="flex items-center justify-between rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-4 py-3"
                >
                  <span className="text-sm font-medium text-ds-text-primary">
                    {account.label}
                  </span>
                  {account.connected ? (
                    <span className="rounded-ds-pill bg-ds-success/10 px-2 py-0.5 text-xs font-medium text-ds-success">
                      Connected
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-ds-text-secondary">
                      Not connected
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ds-text-primary">
              Your data
            </h2>
            <p className="text-sm text-ds-text-secondary">
              Download a JSON copy of your account and documents.
            </p>
          </div>
          <div>
            <a
              href="/api/account/export"
              download
              className="inline-flex h-11 items-center justify-center rounded-full border border-ds-border-strong bg-ds-surface-base px-6 text-sm font-medium text-ds-text-primary transition hover:bg-ds-surface-sunken"
            >
              Download my data
            </a>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-ds-danger/30 bg-ds-surface-base p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ds-danger">
              Danger zone
            </h2>
            <p className="text-sm text-ds-text-secondary">
              Irreversible actions for your account.
            </p>
          </div>
          <DeleteAccountForm email={user.email} />
        </section>

        <Link
          href="/app/settings/billing"
          className="text-sm font-medium text-ds-text-secondary underline-offset-4 transition hover:text-ds-text-primary hover:underline"
        >
          Billing &amp; Plan →
        </Link>

        <Link
          href="/app"
          className="text-sm font-medium text-ds-text-secondary underline-offset-4 transition hover:text-ds-text-primary hover:underline"
        >
          ← Back to documents
        </Link>
      </div>
    </main>
  );
}
