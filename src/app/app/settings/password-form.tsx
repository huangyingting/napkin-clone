"use client";

import { useActionState, useEffect, useRef } from "react";

import { changePassword, type PasswordFormState } from "./actions";

const initialState: PasswordFormState = { status: "idle" };

const fieldClass =
  "h-11 rounded-lg border border-black/10 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-800";

const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/**
 * The change-password form: verifies the current password and sets a new one
 * via the `changePassword` server action.
 *
 * When the account has no password yet (Google-only sign-in) it renders a
 * "set a password" variant — the current-password field is hidden and an
 * explanatory note is shown. On success the password fields are cleared so the
 * typed secrets don't linger in the DOM.
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, isPending] = useActionState(
    changePassword,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  const submitLabel = hasPassword ? "Update password" : "Set password";

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex w-full flex-col gap-4"
    >
      {hasPassword ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-current-password" className={labelClass}>
            Current password
          </label>
          <input
            id="settings-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-label="Current password"
            className={fieldClass}
          />
        </div>
      ) : (
        <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          You signed in with Google. Set a password to also sign in with your
          email and password.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-new-password" className={labelClass}>
          New password
        </label>
        <input
          id="settings-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          aria-label="New password"
          className={fieldClass}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Use at least 8 characters.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-confirm-password" className={labelClass}>
          Confirm new password
        </label>
        <input
          id="settings-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-label="Confirm new password"
          className={fieldClass}
        />
      </div>

      {state.status === "success" ? (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          {hasPassword ? "Password updated." : "Password set."}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
