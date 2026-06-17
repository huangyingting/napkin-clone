import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  GoogleSignInButton,
  OrDivider,
} from "@/components/google-sign-in-button";
import { getCurrentUser } from "@/lib/session";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up — Napkin Clone",
};

export default async function SignupPage() {
  if (await getCurrentUser()) {
    redirect("/app");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-2xl border border-black/[.06] bg-white p-8 shadow-sm dark:border-white/[.08] dark:bg-zinc-950">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create your account
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Start turning text into visuals — it&apos;s free.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          <GoogleSignInButton />
          <OrDivider />
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
