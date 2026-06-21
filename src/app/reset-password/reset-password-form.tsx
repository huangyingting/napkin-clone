"use client";

import Link from "next/link";
import { useActionState } from "react";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

import { type ResetPasswordState, resetPassword } from "./actions";

const fieldClass =
  "h-11 rounded-ds-md border border-ds-border-strong bg-ds-surface-base px-3 text-sm text-ds-text-primary outline-none transition placeholder:text-ds-text-muted focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30";

const initialState: ResetPasswordState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPassword,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className="flex w-full flex-col gap-4">
        <p
          role="status"
          className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-base px-3 py-3 text-sm text-ds-text-secondary"
        >
          Your password has been reset. You can now log in with your new
          password.
        </p>
        <Link
          href="/login"
          className="flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="newPassword"
          className="text-sm font-medium text-ds-text-primary"
        >
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={fieldClass}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="confirmPassword"
          className="text-sm font-medium text-ds-text-primary"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={fieldClass}
          placeholder="Re-enter your new password"
        />
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover disabled:opacity-60"
      >
        {isPending ? "Resetting…" : "Reset password"}
      </button>

      <p className="text-center text-sm text-ds-text-secondary">
        <Link
          href="/login"
          className="font-medium text-ds-accent underline-offset-4 hover:underline"
        >
          Back to log in
        </Link>
      </p>
    </form>
  );
}
