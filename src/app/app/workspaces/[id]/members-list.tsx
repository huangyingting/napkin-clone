"use client";

import { useState, useTransition } from "react";

import { Dialog } from "@/components/ui/dialog";

import { removeMember, transferOwnership } from "./actions";

type Member = {
  id: string;
  userId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  user: { email: string; name: string | null };
};

type Workspace = {
  id: string;
  ownerId: string;
  owner: { email: string; name: string | null };
  members: Member[];
};

const roleLabels = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export function MembersList({
  workspace,
  isOwner,
  currentUserId,
}: {
  workspace: Workspace;
  isOwner: boolean;
  currentUserId: string;
}) {
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allMembers = [
    {
      id: "owner",
      userId: workspace.ownerId,
      role: "OWNER" as const,
      user: workspace.owner,
    },
    ...workspace.members,
  ];

  const handleRemove = (memberId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(memberId);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove.");
      }
    });
  };

  const handleTransfer = () => {
    if (!transferTarget) return;
    const target = transferTarget;
    setError(null);
    startTransition(async () => {
      try {
        await transferOwnership(workspace.id, target.userId);
        window.location.reload();
      } catch (err) {
        setTransferTarget(null);
        setError(err instanceof Error ? err.message : "Could not transfer.");
      }
    });
  };

  return (
    <ul className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-4">
      {error && <li className="text-xs text-ds-danger-text">{error}</li>}
      {allMembers.map((member) => (
        <li
          key={member.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3"
        >
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <span className="truncate text-sm font-medium text-ds-text-primary">
              {member.user.name || member.user.email}
            </span>
            {member.user.name && (
              <span className="truncate text-xs text-ds-text-muted">
                {member.user.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ds-state-selected px-2 py-0.5 text-xs font-medium text-ds-text-secondary">
              {roleLabels[member.role]}
            </span>
            {isOwner &&
              member.role !== "OWNER" &&
              member.userId !== currentUserId && (
                <>
                  <button
                    onClick={() => {
                      setError(null);
                      setTransferTarget(member);
                    }}
                    disabled={isPending}
                    className="text-xs text-ds-text-secondary transition hover:text-ds-text-primary disabled:opacity-60"
                    aria-label={`Make ${member.user.email} the owner`}
                  >
                    Make owner
                  </button>
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={isPending}
                    className="text-xs text-ds-text-secondary transition hover:text-ds-danger-text disabled:opacity-60"
                    aria-label={`Remove ${member.user.email}`}
                  >
                    Remove
                  </button>
                </>
              )}
          </div>
        </li>
      ))}

      <Dialog
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        aria-labelledby="transfer-ownership-title"
        className="max-w-md"
      >
        <h2
          id="transfer-ownership-title"
          className="text-base font-semibold text-ds-text-primary"
        >
          Transfer ownership?
        </h2>
        <p className="mt-2 text-sm text-ds-text-secondary">
          {transferTarget?.user.name || transferTarget?.user.email} will become
          the workspace owner. You will be demoted to an editor and can no
          longer rename, delete, or manage members.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setTransferTarget(null)}
            className="rounded-full px-4 py-2 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={isPending}
            className="rounded-full bg-ds-control px-4 py-2 text-sm font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Transfer ownership
          </button>
        </div>
      </Dialog>
    </ul>
  );
}
