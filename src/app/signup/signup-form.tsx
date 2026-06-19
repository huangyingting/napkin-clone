"use client";

import Link from "next/link";
import { useActionState } from "react";

import { register } from "./actions";

const fieldClass =
  "h-11 rounded-lg border border-ghost-border bg-ghost-bg px-3 text-sm text-ghost-text outline-none transition focus:border-ghost-accent focus:ring-2 focus:ring-ghost-accent/30";

export function SignupForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    register,
    undefined,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ghost-text">
          Name <span className="text-ghost-secondary">(optional)</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          className={fieldClass}
          placeholder="Ada Lovelace"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ghost-text">
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
          className="text-sm font-medium text-ghost-text"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={fieldClass}
          placeholder="At least 8 characters"
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
        className="flex h-11 items-center justify-center rounded-full bg-ghost-accent px-6 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-ghost-secondary">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-ghost-accent underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
