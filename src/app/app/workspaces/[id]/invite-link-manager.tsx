"use client";

import { useState } from "react";

import { createInviteLink, revokeInviteLink, type InviteLink } from "./actions";

const roleLabels = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export function InviteLinkManager({
  workspaceId,
  inviteLinks,
}: {
  workspaceId: string;
  inviteLinks: InviteLink[];
}) {
  const [links, setLinks] = useState(inviteLinks);
  const [selectedRole, setSelectedRole] = useState<"EDITOR" | "VIEWER">(
    "EDITOR",
  );

  const handleCreate = async () => {
    const link = await createInviteLink(workspaceId, selectedRole);
    setLinks([link, ...links]);
  };

  const handleRevoke = async (linkId: string) => {
    await revokeInviteLink(linkId);
    setLinks(links.filter((l) => l.id !== linkId));
  };

  const getInviteUrl = (token: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/app/join/${token}`;
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedRole}
            onChange={(e) =>
              setSelectedRole(e.target.value as "EDITOR" | "VIEWER")
            }
            className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-white/25 dark:focus:ring-white/10"
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button
            onClick={handleCreate}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create invite link
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Anyone with the link can join this workspace with the selected role.
        </p>
      </div>

      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-col gap-2 rounded-lg border border-black/[.06] bg-zinc-50 p-3 dark:border-white/[.08] dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {roleLabels[link.role]}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Created{" "}
                      {new Date(link.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <input
                    readOnly
                    value={getInviteUrl(link.token)}
                    onClick={(e) => {
                      e.currentTarget.select();
                      navigator.clipboard.writeText(e.currentTarget.value);
                    }}
                    className="mt-2 w-full cursor-pointer truncate rounded border border-black/[.06] bg-white px-2 py-1 text-xs font-mono text-zinc-700 dark:border-white/[.08] dark:bg-zinc-950 dark:text-zinc-300"
                  />
                </div>
                <button
                  onClick={() => handleRevoke(link.id)}
                  className="shrink-0 text-sm text-zinc-600 transition hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                  aria-label="Revoke invite link"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
