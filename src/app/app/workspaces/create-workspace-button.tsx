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
        className="rounded-2xl border border-black/[.06] bg-white p-0 shadow-lg backdrop:bg-black/50 dark:border-white/[.08] dark:bg-zinc-950"
      >
        <form action={action} className="flex w-80 flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Create workspace
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A workspace lets you collaborate with your team on documents.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="name"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
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
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25 dark:focus:ring-white/10"
            />
            {error && typeof error === "string" && !error.startsWith("/") && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
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
              className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
      className="flex-1 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Creating..." : "Create"}
    </button>
  );
}
