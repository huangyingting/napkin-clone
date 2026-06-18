"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { deleteAccount, type DeleteAccountState } from "./actions";

const initialState: DeleteAccountState = { status: "idle" };

/** Literal keyword accepted as a confirmation alternative to the email. */
const DELETE_KEYWORD = "DELETE";

/**
 * The Danger zone control: a "Delete account" button that opens a confirmation
 * dialog requiring the user to type their exact email address (or the literal
 * word "DELETE") before the account is permanently removed.
 *
 * The confirm button is guarded client-side (disabled until the typed value
 * matches), and the server action re-validates the confirmation independently.
 * Submitting calls `deleteAccount`, which signs the user out and redirects to
 * the marketing home on success (so this component simply unmounts); an error
 * keeps the dialog open with a `role="alert"` message.
 *
 * The dialog is portaled to `document.body` (per AGENTS.md) so it escapes the
 * settings card's stacking context.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, isPending] = useActionState(
    deleteAccount,
    initialState,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = confirmation.trim();
  const canSubmit =
    trimmed.toLowerCase() === email.trim().toLowerCase() ||
    trimmed === DELETE_KEYWORD;

  const close = () => {
    if (isPending) {
      return;
    }
    setOpen(false);
    setConfirmation("");
  };

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        setOpen(false);
        setConfirmation("");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, isPending]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Permanently delete your account and everything in it — your documents,
        visuals, comments, and workspaces you own. This can&apos;t be undone.
      </p>
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center justify-center rounded-full border border-red-600/30 px-6 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Delete account
        </button>
      </div>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              aria-hidden="true"
              onClick={close}
            />
            <form
              action={formAction}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-6 shadow-xl dark:border-white/[.08] dark:bg-zinc-950"
            >
              <h2
                id="delete-account-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Delete account?
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This permanently deletes your account and all of your documents,
                visuals, comments, and owned workspaces. This action cannot be
                undone.
              </p>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="delete-account-confirm"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Type{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {email}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="delete-account-confirm"
                  ref={inputRef}
                  name="confirmation"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Confirm account deletion"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={email}
                  className="h-11 rounded-lg border border-black/10 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-700"
                />
              </div>

              {state.status === "error" ? (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {state.message}
                </p>
              ) : null}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={isPending}
                  className="flex h-9 items-center justify-center rounded-full border border-black/[.06] px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-white/[.08] dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || isPending}
                  className="flex h-9 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {isPending ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
