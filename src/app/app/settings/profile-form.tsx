"use client";

import { useActionState } from "react";

import { updateProfile, type ProfileFormState } from "./actions";

const initialState: ProfileFormState = { status: "idle" };

const fieldClass =
  "h-11 rounded-lg border border-black/10 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-800";

const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/**
 * The account profile form: edits the current user's display name via the
 * `updateProfile` server action. The email is shown read-only (it can't be
 * changed here). The display-name input is uncontrolled (`defaultValue`) so it
 * keeps the typed value after saving; a reload re-reads the fresh name from the
 * database.
 */
export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateProfile,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-email" className={labelClass}>
          Email
        </label>
        <input
          id="settings-email"
          type="email"
          value={email}
          readOnly
          disabled
          aria-label="Email"
          className={`${fieldClass} cursor-not-allowed text-zinc-500 opacity-70 dark:text-zinc-400`}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Your email address can&apos;t be changed.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-name" className={labelClass}>
          Display name
        </label>
        <input
          id="settings-name"
          name="name"
          type="text"
          maxLength={100}
          defaultValue={initialName}
          autoComplete="name"
          aria-label="Display name"
          placeholder="Your name"
          className={fieldClass}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Shown in the header and across the app. Leave blank to use your email.
        </p>
      </div>

      {state.status === "success" ? (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          Profile updated.
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
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
