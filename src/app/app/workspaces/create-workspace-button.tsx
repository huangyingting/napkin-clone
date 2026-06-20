"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { createWorkspace } from "./actions";

export function CreateWorkspaceButton({
  className,
  children = "New workspace",
}: {
  className: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, action] = useActionState(createWorkspace, null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (error && error.startsWith("/app/workspaces/")) {
      dialogRef.current?.close();
      router.push(error);
    }
  }, [error, router]);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => dialogRef.current?.showModal()}
      >
        {children}
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border border-ds-border-subtle bg-ds-surface-overlay p-0 shadow-ds-overlay backdrop:bg-ds-backdrop"
      >
        <form action={action} className="flex w-80 flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ds-text-primary">
              Create workspace
            </h2>
            <p className="text-sm text-ds-text-secondary">
              A workspace lets you collaborate with your team on documents.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="name"
              className="text-sm font-medium text-ds-text-primary"
            >
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              placeholder="Marketing team"
              className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10"
            />
            {error && typeof error === "string" && !error.startsWith("/") && (
              <p
                role="alert"
                className="text-sm text-ds-danger-text"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <SubmitButton />
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex-1 rounded-full border border-ds-border-subtle bg-ds-surface-raised px-4 py-2 text-sm font-medium text-ds-text-primary transition hover:bg-ds-state-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 rounded-full bg-ds-control px-4 py-2 text-sm font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:opacity-60"
    >
      {pending ? "Creating..." : "Create"}
    </button>
  );
}
