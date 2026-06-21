"use client";

import { useActionState } from "react";

import { requestEmailVerification, type VerifyEmailResult } from "./actions";

const initialState: VerifyEmailResult | null = null;

/**
 * The "Verify email" affordance: an unverified user requests a verification
 * link via the `requestEmailVerification` server action. Rendered only when the
 * email is not yet verified (the parent shows a verified badge instead).
 */
export function EmailVerificationForm() {
  const [state, formAction, isPending] = useActionState(
    requestEmailVerification,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center justify-center rounded-full bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send verification email"}
        </button>
      </div>

      {state?.ok && state.data.status === "sent" ? (
        <p role="status" className="text-sm text-ds-success">
          Verification email sent. Check your inbox for the link.
        </p>
      ) : null}
      {state?.ok && state.data.status === "already_verified" ? (
        <p role="status" className="text-sm text-ds-success">
          Your email is already verified.
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
