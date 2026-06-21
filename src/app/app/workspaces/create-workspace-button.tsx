"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button, Dialog, FIELD_CONTROL } from "@/components/ui";

import { createWorkspace } from "./actions";

export function CreateWorkspaceButton({
  className,
  children = "New workspace",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, action] = useActionState(createWorkspace, null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (error && error.startsWith("/app/workspaces/")) {
      router.push(error);
    }
  }, [error, router]);

  return (
    <>
      <Button
        variant="solid"
        size="lg"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="create-workspace-title"
        className="max-w-sm"
      >
        <form action={action} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2
              id="create-workspace-title"
              className="text-lg font-semibold text-ds-text-primary"
            >
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
              className={`${FIELD_CONTROL} h-10 px-3`}
            />
            {error && typeof error === "string" && !error.startsWith("/") && (
              <p role="alert" className="text-sm text-ds-danger-text">
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <SubmitButton />
            <Button
              variant="subtle"
              size="lg"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      variant="solid"
      size="lg"
      className="flex-1"
    >
      {pending ? "Creating..." : "Create"}
    </Button>
  );
}
