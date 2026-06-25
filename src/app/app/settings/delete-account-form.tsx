"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DeleteAccountResult } from "@/lib/auth/form-state";

import { deleteAccount } from "./actions";

const initialState: DeleteAccountResult | null = null;

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
      <p className="text-sm text-ds-text-secondary">
        Permanently delete your account and everything in it — your documents,
        visuals, comments, and workspaces you own. This can&apos;t be undone.
      </p>
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center justify-center rounded-full border border-ds-danger/40 px-6 text-sm font-medium text-ds-danger transition hover:bg-ds-danger/10"
        >
          Delete account
        </button>
      </div>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-ds-backdrop"
              aria-hidden="true"
              onClick={close}
            />
            <form
              action={formAction}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              className="relative z-raised flex w-full max-w-md flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6 shadow-xl"
            >
              <h2
                id="delete-account-title"
                className="text-base font-semibold text-ds-text-primary"
              >
                Delete account?
              </h2>
              <p className="text-sm text-ds-text-secondary">
                This permanently deletes your account and all of your documents,
                visuals, comments, and owned workspaces. This action cannot be
                undone.
              </p>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="delete-account-confirm"
                  className="text-sm font-medium text-ds-text-primary"
                >
                  Type{" "}
                  <span className="font-semibold text-ds-text-primary">
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
                  className="h-11 rounded-lg border border-ds-border-strong bg-ds-surface-base px-3 text-sm text-ds-text-primary outline-none transition focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30"
                />
              </div>

              {state && !state.ok ? (
                <p role="alert" className="text-sm text-ds-danger">
                  {state.error}
                </p>
              ) : null}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={isPending}
                  className="flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || isPending}
                  className="flex h-9 items-center justify-center rounded-full bg-ds-danger px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90 disabled:opacity-60"
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
