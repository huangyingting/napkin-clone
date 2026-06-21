"use client";

import Link from "next/link";
import { useActionState } from "react";

import { type ForgotPasswordState, requestPasswordReset } from "./actions";

const fieldClass =
  "h-11 rounded-ds-md border border-ds-border-strong bg-ds-surface-base px-3 text-sm text-ds-text-primary outline-none transition placeholder:text-ds-text-muted focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30";

const initialState: ForgotPasswordState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="flex w-full flex-col gap-4">
        <p
          role="status"
          className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-base px-3 py-3 text-sm text-ds-text-secondary"
        >
          {state.message}
        </p>
        <p className="text-center text-sm text-ds-text-secondary">
          <Link
            href="/login"
            className="font-medium text-ds-accent underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-ds-text-primary"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClass}
          placeholder="you@example.com"
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
        {isPending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-ds-text-secondary">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-ds-accent underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
