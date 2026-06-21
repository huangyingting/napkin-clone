"use client";

import { useState, useTransition } from "react";

import { Dialog } from "@/components/ui/dialog";

import { deleteWorkspace, leaveWorkspace, renameWorkspace } from "./actions";

/**
 * Per-role workspace lifecycle controls.
 *
 * - Owners see a rename field and a delete button (confirmed via Dialog).
 * - Non-owner members see a leave button (confirmed via Dialog).
 *
 * Every control calls a server action that re-enforces authorization
 * server-side; the role-gated rendering here is purely a UX affordance.
 */
export function WorkspaceSettings({
  workspaceId,
  name,
  isOwner,
}: {
  workspaceId: string;
  name: string;
  isOwner: boolean;
}) {
  const [nameValue, setNameValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmed = nameValue.trim();
  const renameDisabled = isPending || trimmed === "" || trimmed === name;

  const handleRename = () => {
    setError(null);
    startTransition(async () => {
      try {
        await renameWorkspace(workspaceId, trimmed);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not rename.");
      }
    });
  };

  const handleDestructive = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (isOwner) {
          await deleteWorkspace(workspaceId);
        } else {
          await leaveWorkspace(workspaceId);
        }
        // Server actions redirect on success; reload as a fallback.
        window.location.assign("/app/workspaces");
      } catch (err) {
        setConfirmOpen(false);
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-6">
      {isOwner && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="workspace-name"
            className="text-sm font-medium text-ds-text-primary"
          >
            Workspace name
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="workspace-name"
              value={nameValue}
              maxLength={100}
              onChange={(e) => setNameValue(e.target.value)}
              className="flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2 text-sm text-ds-text-primary focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10"
            />
            <button
              type="button"
              onClick={handleRename}
              disabled={renameDisabled}
              className="rounded-full bg-ds-control px-4 py-2 text-sm font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-ds-danger-text">{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-ds-border-subtle pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ds-text-primary">
            {isOwner ? "Delete workspace" : "Leave workspace"}
          </span>
          <span className="text-xs text-ds-text-muted">
            {isOwner
              ? "Documents move to their owners' personal spaces. This cannot be undone."
              : "You'll lose access. Documents you authored stay with you."}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          className="shrink-0 rounded-full border border-ds-danger/30 px-4 py-2 text-sm font-medium text-ds-danger transition hover:bg-ds-danger/10"
        >
          {isOwner ? "Delete" : "Leave"}
        </button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        aria-labelledby="workspace-destructive-title"
        className="max-w-md"
      >
        <h2
          id="workspace-destructive-title"
          className="text-base font-semibold text-ds-text-primary"
        >
          {isOwner ? "Delete this workspace?" : "Leave this workspace?"}
        </h2>
        <p className="mt-2 text-sm text-ds-text-secondary">
          {isOwner
            ? "All members and invite links will be removed. Documents are moved to their owners' personal spaces — nothing is deleted."
            : "You'll be removed from this workspace and lose access to its shared documents. Documents you authored remain yours."}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-full px-4 py-2 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDestructive}
            disabled={isPending}
            className="rounded-full bg-ds-danger px-4 py-2 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOwner ? "Delete workspace" : "Leave workspace"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
