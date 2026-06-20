import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
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
    select: { name: true, email: true, passwordHash: true },
  });

  if (!user) {
    redirect("/login");
  }

  const hasPassword = Boolean(user.passwordHash);

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
            <h2 className="text-base font-semibold text-ds-text-primary">Profile</h2>
            <p className="text-sm text-ds-text-secondary">
              Update your display name.
            </p>
          </div>
          <ProfileForm initialName={user.name ?? ""} email={user.email} />
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
