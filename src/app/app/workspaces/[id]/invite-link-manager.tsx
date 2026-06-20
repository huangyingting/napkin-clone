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
    <div className="flex flex-col gap-4 rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedRole}
            onChange={(e) =>
              setSelectedRole(e.target.value as "EDITOR" | "VIEWER")
            }
            className="flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2 text-sm text-ds-text-primary focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10"
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button
            onClick={handleCreate}
            className="rounded-full bg-ds-control px-4 py-2 text-sm font-medium text-ds-control-text transition hover:bg-ds-control-hover"
          >
            Create invite link
          </button>
        </div>
        <p className="text-xs text-ds-text-muted">
          Anyone with the link can join this workspace with the selected role.
        </p>
      </div>

      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-col gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-ds-state-selected px-2 py-0.5 text-xs font-medium text-ds-text-secondary">
                      {roleLabels[link.role]}
                    </span>
                    <span className="text-xs text-ds-text-muted">
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
                    className="mt-2 w-full cursor-pointer truncate rounded border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-xs font-mono text-ds-text-secondary"
                  />
                </div>
                <button
                  onClick={() => handleRevoke(link.id)}
                  className="shrink-0 text-sm text-ds-text-secondary transition hover:text-ds-danger-text"
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
