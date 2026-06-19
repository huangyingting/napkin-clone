import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  GoogleSignInButton,
  OrDivider,
} from "@/components/google-sign-in-button";
import { getCurrentUser } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in — Napkin Clone",
};

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/app");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-ghost-wash px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-2xl border border-ghost-border bg-ghost-bg p-8 shadow-sm">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ghost-text">
            Welcome back
          </h1>
          <p className="text-sm text-ghost-secondary">
            Log in to your Napkin Clone account.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          <GoogleSignInButton />
          <OrDivider />
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
