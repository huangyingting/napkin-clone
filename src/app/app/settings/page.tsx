import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Settings — Napkin Clone",
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
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Settings
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage your account profile.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Profile
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Update your display name.
            </p>
          </div>
          <ProfileForm initialName={user.name ?? ""} email={user.email} />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {hasPassword ? "Change password" : "Set a password"}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {hasPassword
                ? "Update the password you use to sign in."
                : "Add a password so you can sign in with your email too."}
            </p>
          </div>
          <PasswordForm hasPassword={hasPassword} />
        </section>

        <Link
          href="/app"
          className="text-sm font-medium text-zinc-600 underline-offset-4 transition hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to documents
        </Link>
      </div>
    </main>
  );
}
