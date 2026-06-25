"use client";

import { useActionState } from "react";

import { AuthMessage, AuthSubmitButton } from "@/components/auth/auth-form";
import type { VerifyEmailResult } from "@/lib/auth/form-state";

import { requestEmailVerification } from "./actions";

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
        <AuthSubmitButton isPending={isPending} pendingLabel="Sending…">
          Send verification email
        </AuthSubmitButton>
      </div>

      {state?.ok && state.data.status === "sent" ? (
        <AuthMessage kind="success">
          Verification email sent. Check your inbox for the link.
        </AuthMessage>
      ) : null}
      {state?.ok && state.data.status === "already_verified" ? (
        <AuthMessage kind="success">
          Your email is already verified.
        </AuthMessage>
      ) : null}
      {state && !state.ok ? (
        <AuthMessage kind="error">{state.error}</AuthMessage>
      ) : null}
    </form>
  );
}
