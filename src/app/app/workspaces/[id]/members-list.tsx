"use client";

import { removeMember } from "./actions";

type Member = {
  id: string;
  userId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  user: { email: string; name: string | null };
};

type Workspace = {
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
  const allMembers = [
    {
      id: "owner",
      userId: workspace.ownerId,
      role: "OWNER" as const,
      user: workspace.owner,
    },
    ...workspace.members,
  ];

  const handleRemove = async (memberId: string) => {
    await removeMember(memberId);
    window.location.reload();
  };

  return (
    <ul className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-4">
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
                <button
                  onClick={() => handleRemove(member.id)}
                  className="text-xs text-ds-text-secondary transition hover:text-ds-danger-text"
                  aria-label={`Remove ${member.user.email}`}
                >
                  Remove
                </button>
              )}
          </div>
        </li>
      ))}
    </ul>
  );
}
