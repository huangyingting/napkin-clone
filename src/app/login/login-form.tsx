"use client";

import Link from "next/link";
import { useActionState } from "react";

import { authenticate } from "./actions";

const fieldClass =
  "h-11 rounded-ds-md border border-ds-border-strong bg-ds-surface-base px-3 text-sm text-ds-text-primary outline-none transition placeholder:text-ds-text-muted focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30";

export function LoginForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

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

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-ds-text-primary"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClass}
          placeholder="••••••••"
        />
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-ghost-red">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover disabled:opacity-60"
      >
        {isPending ? "Signing in…" : "Log in"}
      </button>

      <p className="text-center text-sm text-ds-text-secondary">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-ds-accent underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
