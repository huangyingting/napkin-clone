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
    <ul className="flex flex-col gap-2 rounded-xl border border-black/[.06] bg-white p-4 dark:border-white/[.08] dark:bg-zinc-950">
      {allMembers.map((member) => (
        <li
          key={member.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-black/[.06] bg-zinc-50 p-3 dark:border-white/[.08] dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {member.user.name || member.user.email}
            </span>
            {member.user.name && (
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {member.user.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {roleLabels[member.role]}
            </span>
            {isOwner &&
              member.role !== "OWNER" &&
              member.userId !== currentUserId && (
                <button
                  onClick={() => handleRemove(member.id)}
                  className="text-xs text-zinc-600 transition hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
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
